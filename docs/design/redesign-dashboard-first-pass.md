# Dashboard: design spec (redesign step 5, first page)

Status (2026-11-26): **superseded.** This was the first pass at the step-5 dashboard. The owner
rejected the result (journal, 2026-11-25, "The reskin was not enough"), and [redesign-rethink.md](redesign-rethink.md)
section 6 (the NAS map) and [style guide section 10](style-guide.md#10-the-generated-look-what-we-never-do)
replace its layout, its regions and its look. It is kept for the parts that still hold: the data rules
per region (sections 4.2, 8.2, 9.1), what moved where (10.3), a normal user's dashboard (11), the tests
whose expectations change (17), the adversarial pass (18) and the hand-off notes (19). Where it
disagrees with the rethink or the style guide, they win.
Scope: `DashboardPage.tsx` and the molecules and organisms it composes. No contract change, no new
backend method. Every fact and safety signal the page shows today is kept; what changes is the
composition, the order, the pictures and where the prose lives.

Sources: `docs/redesign-plan.md`, `docs/design/visual-foundation.md` (normative; 3.6, 7, 8, 9, 11, 12,
13), `docs/design/style-guide.md` 5.4 to 5.10 (still normative), `docs/design/phase-5-monitoring.md`
(the rules for each card's data), `docs/05-security.md`, the lab's Sky dashboard
(`src/lab/screens/Dashboard.tsx`, reference only; removed from the lab on 2026-11-27).

---

## 0. Decisions in this spec, and the ones the owner must make

| # | Decision | Recommendation | Needs the owner? |
| --- | --- | --- | --- |
| D1 | Page name | **Keep "Dashboard"** (section 1) | Yes: the foundation says Overview |
| D2 | What the page adds to pending changes | **Nothing.** The band and the top-bar pill already say it; a second gold surface would break "gold at size only in the band" | No |
| D3 | The health ring's areas | **Storage, Disks, Services, System.** Network is left out: nothing the page reads makes a health claim about it (an unplugged port is a fact, not a status; phase-5 1.5) | Yes, briefly |
| D4 | Storage's area word when nothing is full, missing or past its level | Status OK with the precise word **"Nothing full"**. Phase-5 1.2.3 refuses an OK pill on a single file system (with level 0 nothing is monitored); the area makes a narrower, true claim. Individual rings still carry no OK pill | **Yes**: it relaxes a recorded rule at the roll-up level |
| D5 | "Everything is OK" needs a disk check in this session | Yes. Disk health is read only on request (it wakes disks), and a roll-up with an unread member is never fine (`rollUp`). Most visits will read **"No problems found"** with "Disk health has not been checked since you signed in" and a "Check disk health" button | **Yes**: the owner should know the default headline is not "Everything is OK" |
| D6 | "Set up your NAS" becomes **"First steps"** | Rename title, hide button and dialog copy (section 9) | Yes, light |
| D7 | The page title | The `h1` stays "Dashboard" as a small eyebrow above the display headline; the headline is not the `h1` (section 4.1) | No |

No destructive action is added. The one irreversible action on the page (hiding first steps for every
administrator) keeps its confirmation.

---

## 1. Dashboard or Overview

**Recommendation: keep "Dashboard".**

1. **It is OMV's own name for this page.** The classic interface stays installed and linked from
   every classic-only page, and the forum answers, OMV's documentation and the owner's existing
   users all say Dashboard. The skill's rule is "group navigation as OMV groups it so existing users
   find things"; the name of the start page is the first thing they look for.
2. **"Overview" is already taken.** Disk health has a tab called Overview (`smart.tab.overview`,
   `SmartOverviewPage`). Two different Overviews in the sidebar, the palette and the breadcrumbs is a
   real ambiguity; "Dashboard" has no twin.
3. **Cost without a user benefit.** The rename touches `nav.dashboard`, `dashboard.title` and the
   heading or link name in at least ten test files (`ShellLayout`, `SignInPage`, `IdleWarning`,
   `AccountPage`, `SharedFoldersPage`, `SharesRoutes`, `SshPage`, `FirewallPage.changes`,
   `HttpNotice.https`, the four `DashboardPage*` files).

Follow-ups if the owner agrees: amend foundation sections 10 and 13 ("plus Overview", "g then o
(Overview)") to say Dashboard, and record it in the journal. The jump key stays `g` then `o`
(`JUMP_KEYS["/"]`), since `d` is Disks; the palette lists it as "Dashboard  g o".

---

## 2. What the page answers, in order

The owner's cockpit order, which is also the DOM order, the reading order and the focus order at
every width (WCAG 1.3.2 and 2.4.3: no grid placement reorders it):

1. **The answer**: a plain-words headline at the largest size, beside the HealthRing.
2. **What needs you**: one action card per attention row, worst first, one next step each.
3. **Pending changes**: nothing on the page (D2). The shell's band stays directly under the top bar.
4. **Capacity**: Storage, as CapacityRings, with meters for the rest.
5. **Live activity**: "Right now", three live tiles (administrators only).
6. **Disks**: the DriveBay with the disk-health check.
7. **First steps**: while OMV's welcome flag is set.
8. **The rest**: Services, Network, System, each linking to its page.

A normal user sees a different, short page (section 11).

---

## 3. Layout

### 3.1 Grid

- The page is a 12-column grid inside the shell's main region, maximum width 1440px, column gap and
  row gap `gap-gutter` (20px comfortable, 12px compact). The hero is not a card: it sits on the page
  ground under the ambient light (foundation 3.4, 6 level 1). Everything after it is a raised card.
- Breakpoints follow the content width, not the viewport: the sidebar takes about 260px from 1024px
  up, so at a 1280px window the main column is about 940px. Use container queries on the page
  wrapper (`@container`), with these steps: **wide** at a container of 880px or more, **medium** 600
  to 879px, **narrow** under 600px. Tailwind's `@container` and `@lg:` style variants are enough; no
  new token.
- At 200% zoom a 1280px window is a 640px viewport with a drawer: it lays out as medium or narrow,
  with no sideways scroll.

### 3.2 Wide (window 1280px and up; container 880px and up), comfortable

```
+--------------------------------------------------------------------------------------------+
| Dashboard                                                                    (h1, eyebrow) |
| [! Warning]  nas  ·  Updated at 10:42:07                                     (kicker)      |
|                                                                                            |
| 2 things need you                                          .-~~~-.   ! Storage   Warning   |
| Worst first: Data is almost full.                         (   2   )  ? Disks     Not checked|
|                                                           ( to fix )  ✓ Services All running|
|                                                            '-...-'   ! System    Restart needed|
|                                                        (HealthRing lg, legend beside)     |
+--------------------------------------------------------------------------------------------+
| Needs attention                                                                    (h2)    |
| +---------------------------------------------+ +---------------------------------------------+
| | [! Warning]                               > | | [! Warning]                            ↗  |
| | Data is almost full                         | | The NAS needs a restart                      |
| | Data is 87% full, at or above its warning   | | Updates finish installing when it restarts.  |
| | level of 85%.                               | | Restarting is in the classic interface ...   |
| | Open file system Data  →                    | | Restart from the classic interface  ↗        |
| +---------------------------------------------+ +---------------------------------------------+
+--------------------------------------------------------------------------------------------+
| Storage (span 7)                                  | Right now (span 5)                     |
| [! Warning] 1 of 3 file systems: Warning          | Live, read every 2 seconds.            |
|  ( 87% ) Data        [Warning]  ( 41% ) Media     | Showing the last 58 s.                 |
|          87% full · 120 GiB free          ...     | Processor   12 %        ~~~~~~^~~~      |
|          Warns at 85%                             |   Average load 0.23 · 0.09 · 0.02      |
|  ( 23% ) System drive                             | Memory       9 %        ________~~      |
|          Where openmediavault is installed        |   347.8 MiB of 3.8 GiB in use          |
|                                                   | Network · enp2s0  In 1.2  Out 0.3 MiB/s|
| > Show all 6 file systems                         |                         ~~--~~--~~      |
| Open File systems →                               | > Show the readings                    |
+---------------------------------------------------+----------------------------------------+
| Disks (span 7)                                    | First steps (span 5)                   |
| 4 disks · health not checked yet  [Check disk health] | (1/2) First steps          [Hide]  |
| +- nas ------------------------------------------+| ? Change the factory password ...      |
| | [o]   [o]   [o]   [o]                           || ○ Use a secure connection (HTTPS)      |
| | sda   sdb   sdc   sdd                           ||   [Open Web interface settings ↗]     |
| | Not   Not   Not   Not checked                   || ○ Get email alerts ...                 |
| | System Data Data Empty   34 °C  Asleep ...      || · Install updates · Name · Time zone   |
| +------------------------------------------------+|                                        |
| > Why do I have to ask?                           |                                        |
| Open Disks →   Open Disk health →                 |                                        |
+---------------------------------------------------+----------------------------------------+
| Services (span 4)        | Network (span 4)             | System (span 4)                  |
+--------------------------+------------------------------+----------------------------------+
```

Spans at wide:

| Row | With first steps | Without first steps |
| --- | --- | --- |
| Hero | 12 (text 1 to 8, ring 9 to 12) | same |
| Needs attention | 12; cards in an inner grid `repeat(auto-fill, minmax(20rem, 1fr))`, so two across at 940px, three at 1440px. One card alone spans the row | same |
| Storage, Right now | 7, 5 | same |
| Disks, First steps | 7, 5 | Disks 7, Services 5 |
| The rest | Services 4, Network 4, System 4 | Network 6, System 6 |

The rows align at the top (`items-start`); cards do not stretch to equal height, so a short card
never shows a tall empty bottom.

### 3.3 Medium (window about 900px, drawer navigation; container 600 to 879px)

```
+-------------------------------------------------------------+
| Dashboard                                                   |
| [✓ OK]  nas  ·  Updated at 10:42:07                         |
| No problems found                          .-~~~-.          |
| Disk health has not been checked since    (  3/4  )  legend |
| you signed in.                            (checked)  beside |
| [Check disk health]                        '-...-'          |
+-------------------------------------------------------------+
| Needs attention: cards two across (minmax 20rem)            |
+-------------------------------------------------------------+
| Storage (12): rings two across                              |
+-------------------------------------------------------------+
| Right now (12): three tiles across                          |
+-------------------------------------------------------------+
| Disks (12): bay of up to six slots across                   |
+-------------------------------------------------------------+
| First steps (12)                                            |
+------------------------------+------------------------------+
| Services (6)                 | Network (6)                  |
+------------------------------+------------------------------+
| System (12)                                                 |
+-------------------------------------------------------------+
```

The hero keeps the ring beside the text while the container is 600px or more; under that it moves
below the headline.

### 3.4 Narrow (390px phone; container under 600px)

```
+--------------------------------------+
| Dashboard                            |
| [! Critical] nas                     |
| Updated at 10:42:07                  |
| Data is full                         |   display, 28px at this width
|  .-~-.   ⬣ Storage   Critical         |   ring md, legend beside, wraps
| ( 1  )   ? Disks     Not checked     |
| (to fix) ✓ Services  All running      |
|  '-.-'   ✓ System    OK              |
+--------------------------------------+
| Needs attention                      |
| [card]                               |   cards stacked, full width
+--------------------------------------+
| Storage                              |
| (87%) Data  [Critical] ...           |   rings one per row, size sm, words beside
| (23%) System drive ...               |
+--------------------------------------+
| Right now                            |
| Processor 12 %                       |   tiles stacked: name and figure above
| ~~~~~~~~~ (30 s window)              |   the plot; 30 s window on a phone
| Memory ... | Network ...             |
+--------------------------------------+
| Disks                                |
| [Check disk health]                  |   button full width under 400px
| bay: four slots across, wraps        |
+--------------------------------------+
| First steps | Services | Network | System, stacked                   |
+--------------------------------------+
```

Side gutter 16px. At 320px everything above still fits: the ring is `md` (88px) with its legend
wrapping under it (HealthRing is `flex-wrap`), capacity rings are `sm` (56px) with the words beside,
bay slots go to four or three across (DriveBay's `auto-fit` at 3.75rem), and long names wrap
(`overflow-wrap:anywhere` on identifiers).

### 3.5 Compact density

Compact is Instrument's values on Sky's colours (foundation 5). On this page:

| Part | Comfortable | Compact |
| --- | --- | --- |
| Card padding, grid gap | `p-card` 24px, `gap-gutter` 20px | 16px, 12px (by token) |
| Hero vertical space | 32px top, 24px bottom | 16px, 12px |
| Health ring | `lg` (128px) | `md` (88px) |
| Capacity rings | `md` (88px) wide and medium, `sm` narrow | `sm` everywhere |
| Rings shown before "Show all" | 4 | 6 (three across at wide) |
| Attention card minimum width | 20rem | 17rem (three across at 940px) |
| Live figures | Inter, `text-figure` 30px | Roboto Mono, 26px (by `font-readout`) |
| Drive bay | caddies up to 64px wide | 44px (DriveBay's own `compact:` classes) |
| Body text | 15px | 13px (by token) |

The display headline keeps its size in both densities: it is the answer.

---

## 4. Section 1: the answer (hero)

### 4.1 Structure and components

A `section` labelled by the `h1`, on the page ground (no card), with the ambient light behind it.

1. **Page title**: `PageTitle` "Dashboard", styled as an eyebrow: `text-section` (17px, 600),
   `muted-foreground`. It keeps `tabIndex={-1}`, the document title and the focus-on-navigation
   behaviour, so every test and screen reader that finds the heading "Dashboard" still does.
   `PageTitle` (an app atom) needs a `variant="eyebrow"` prop; this is app work, not a library gap.
   Why not make the headline the `h1`: it changes with every poll, which makes a poor landmark and
   a moving target for heading navigation.
2. **Kicker line** (`text-caption`, `tertiary-foreground`, tabular figures): `StatusPill` with the
   overall state and its word; the host name as `Identifier` (mono, server text); "Updated at
   10:42:07". This line replaces `FreshnessLine`: after a failed background poll it reads "Could not
   update since 10:42:07. The figures may be out of date." in a `role="status"` region, followed by
   a small neutral "Try again" button (a foreground read, as today).
3. **Headline**: a `p` with an id, `text-display`, `foreground` ink, never a status hue (big red text
   alarms and reads as tacky; the pill and the ring carry the colour). `tabIndex={-1}` so focus can
   land on it (4.4).
4. **Sub-line**: one sentence, `text-body`, `muted-foreground`, at most two lines at 60ch. Optional
   second sub-line for an unknown area.
5. **One next step, only when the state calls for it**: a `Button` (secondary) "Check disk health"
   in the no-problems-but-not-checked state, "Try again" when an area could not be read, or the link
   "Add storage" when there is no file system. Never in the critical or warning state: those next
   steps are the cards directly below.
6. **HealthRing** `size="lg"` (`md` compact and narrow), `legend="beside"`, `label` "Health of this
   NAS". Four areas, in this order: Storage, Disks, Services, System.

### 4.2 Data: a new pure function in `dashboard.ts`

`healthAreas(input)` and `dashboardAnswer(rows, areas)`, unit-tested like `attentionRows`. Inputs
are what the page already reads: `storageItems`, the ZFS pool health, the session's disk-health
store, `serviceSummary`, `info.rebootRequired`, and each query's state.

**Areas**

| Area | Status and word | From |
| --- | --- | --- |
| Storage | Critical "Critical" if any file system is full or missing, or a ZFS pool is degraded, unusable or damaged; Warning "Warning" if any is at or past its level; Unknown "Could not read" if the mounted list failed with nothing to show; Unknown "Reading…" before the first reply; Unknown "None yet" when no file system is mounted; Unknown "Unknown" if any item has no reading; otherwise OK "Nothing full" (D4) | `storageItems`, `zfsPools` |
| Disks | Unknown "Not checked" before a check this session; Unknown "Checking…" while one runs and none finished before; otherwise the worst of `diskState` over the result, word from `health.*`; Unknown "No reading" when the check listed no disk | `diskHealth` store |
| Services | Critical "Critical" if any service that is on is not running; OK "All running"; Disabled "None on" when no service is on (drawn dashed, and **left out of the overall roll-up**: a choice, not an unknown); Unknown "Could not read" / "Reading…" | `serviceSummary` |
| System | Warning "Restart needed" when `rebootRequired`; OK "OK"; Unknown "Could not read" when System.getInformation was never read | `info` |

Pending is never an area state: a service waiting to be applied is "All running" here and carries
its pending mark in the Services card, as today.

**Overall**: the worst area (`rollUp`, Disabled excluded). The ring's figure:

| Overall | Figure inside the ring (two lines) |
| --- | --- |
| Critical or Warning | the number of status cards, then "to fix" |
| Unknown | "{{known}}/{{total}}", then "checked" (areas with a known state) |
| OK | "OK" |

**Headline and sub-line**, first match wins (`count` = attention cards that carry a status, so the
clock advice does not count):

| State | Headline | Sub-line | Next step |
| --- | --- | --- | --- |
| First read in flight (no System.getInformation and no mounted list yet) | skeleton | skeleton | none |
| Critical or Warning, `count` 1 | the card's own title, "Data is full" | none, or the unknown line below | none |
| Critical or Warning, `count` 2 or more | "{{count}} things need you" | "Worst first: {{title}}." | none |
| Unknown from a failed read | "Part of the NAS could not be read" | "Could not read: {{list}}." (area names, `Intl.ListFormat`) | "Try again" (foreground read of the failed queries) |
| Unknown, no file system | "No problems found" | "There is no file system yet, so the NAS has nowhere to keep files." | link "Add storage" |
| Unknown, disks not checked | "No problems found" | "Disk health has not been checked since you signed in." | "Check disk health" |
| Unknown, disks checking | "No problems found" | "Checking disk health. You can leave this page; the result is kept." | the same button, "Checking…" |
| OK | "Everything is OK" | "Disk health was checked at {{time}}. The rest is read while this page is open." | none |

With Critical or Warning and an unknown area as well, the second sub-line says the unknown in the
same words as its row above ("Disk health has not been checked since you signed in."), and the hero
offers no button; the Disks card has it.

### 4.3 States

- **Loading**: the eyebrow is real; kicker, headline and sub-line are `Skeleton` bars of their real
  heights (the headline bar at `text-display` line height, 60% wide); the ring is its track only,
  breathing (gap G6). A polite `role="status"` "Loading the system information…" (existing string).
- **Error**: System.getInformation never read: System area Unknown "Could not read"; the headline
  follows the table; the System card shows the `role="alert"` failure with the server's message and
  "Try again" (4.3 of the System card, section 10). The hero never shows the server message itself:
  one alert per failure.
- **Stale**: the kicker's stale line (above). Figures stay.
- **Fail-closed**: "Everything is OK" needs all four areas read and OK, with Disks from a check in
  this session. A failed or missing read can only make the answer worse, never better.

### 4.4 Focus

Press "Check disk health" in the hero; the check ends with every disk OK; the headline becomes
"Everything is OK" and the button goes. Focus moves to the headline (`tabIndex={-1}`), the same
pattern as `useFocusTitleWhenGone`, and the result is announced once by the Disks card's live region
("Disk health checked: 4 disks: OK"). The same applies if any other change removes the hero's button
while it has focus.

---

## 5. Section 2: what needs you (action cards)

### 5.1 Components

A `section` labelled by a visible `h2` "Needs attention" (`text-section`; the existing
`dashboard.attention.label`, so the region keeps its name). Absent when there are no rows, as today:
the hero already said "No problems found" or "Everything is OK".

Each row of `attentionRows()` is one `Card variant="action"` inside an `li`:

- `tone="critical"` or `tone="warning"` (the wash in the top end corner), `tone="none"` for the
  clock advice.
- `render` is the router `Link` for a route in this interface, or an `a` with `target="_blank"`
  `rel="noopener noreferrer"` and a fixed `CLASSIC.*` address for the classic interface (UI-3; gap
  G2 for its mark).
- Header: `StatusPill` (Critical or Warning; the clock icon in `muted-foreground` for advice) and
  `CardChevron` at the end (the external mark for a classic link, G2).
- Title, `h3`, `text-section`: the new short title (table below). Server names are isolated text
  (`isolate`, `IdentifierText`), never clamped in a critical card: they wrap.
- Body, `muted-foreground`: the existing sentence (disk reason, monitoring-off remark).
- Foot: the next-step words in `action-label` with an arrow (or the external mark), and for a disk
  row the secondary "Read at 10:41." in `tertiary-foreground`.
- **Accessible name**: `aria-labelledby` the next-step words (plus "(opens in a new tab)" for a
  classic link), so the link names in today's tests survive ("Open disk sdb", "Open the rsync
  server"). `aria-describedby` the title and the body, so a screen reader hears what and why after
  where. The pill word is inside the description ("Critical. Data is full. …").

Order: `attentionRows()` exactly (worst first, then the fixed order of kinds; rows never change
places between polls). **At most six cards show**; more go behind an inline `Disclosure` "Show 4
more" / "Show fewer". The sort puts Critical first, so a hidden card is never worse than a shown one,
and the headline counts all of them.

A card added while the page is open (a poll found a new problem) enters with the settle motion and
is announced once in a polite `role="status"` inside the section: "1 new item needs attention."
Nothing is announced on first load (the page title and the hero do that).

### 5.2 Copy per kind

New title strings; bodies are today's sentences unless marked "new". Next steps are today's links
unless marked.

| Kind | Pill | Title (new) | Body | Next step |
| --- | --- | --- | --- | --- |
| fsFull | Critical | "{{name}} is full" | "{{name}} is full. Nothing more can be saved on it until you delete or move some files." changes to (new) "Nothing more can be saved on it until you delete or move some files." | "Open file system {{name}}" or "Open File systems" |
| fsMissing | Critical | "{{name}} is missing" | (new) "Its disk may be disconnected or have failed. Shared folders on it cannot be reached." | as fsFull |
| zfsPool degraded | Critical | "ZFS pool `tank` is missing a disk" | (new) "A disk in it is missing or has failed. Open the pool to see which one." | "Open pool tank" or the classic ZFS link |
| zfsPool unusable | Critical | "ZFS pool `tank` cannot be used" | (new) "None of its file systems can be reached." | as above |
| zfsPool damaged | Critical | "ZFS pool `tank` has damaged files" | (new) "Open the pool to see which files." | as above |
| diskCritical | Critical | "Disk `sdb` may fail soon" | the reason sentence ("Many damaged areas (bad sectors). It may fail soon. Copy your data off it and replace it."), the model in brackets, and the monitoring-off remark | "Open disk sdb" + "Read at 10:41." |
| diskWarning | Warning | "Disk `sdb` reported a problem" | the reason sentence | as above |
| servicesDown, one | Critical | "{{title}} is not running" | (new) "It is turned on, but it has stopped. Computers cannot use it until it starts." | today's per-service link |
| servicesDown, several | Critical | "{{count}} services are not running" | "{{list}} are turned on, but have stopped. Computers cannot use them until they start." (new) | "Look for the reason in the system logs" |
| fsWarning | Warning | "{{name}} is almost full" | (new) "It is {{percent}} full, at or above its warning level of {{threshold}}." | as fsFull |
| restart | Warning | "The NAS needs a restart" | (new) "Updates finish installing when it restarts. Restarting is in the classic interface, in the power menu at the top right." | (new words) "Restart from the classic interface" → `CLASSIC_HOME` |
| clock | none (clock icon) | "The clocks differ by {{duration}}" | (new) "If the NAS clock is wrong, schedules and logs will be too." | "Check Date and time in the classic interface" |

"Almost full" is a title, not a pill word: the pill keeps the fixed status word (style guide 5.5).

---

## 6. Section 3: pending changes

**The page adds nothing** (D2). The band under the top bar is the one place that offers Apply and
Undo, with its confirmations and the network-apply escalation; repeating it would put a second gold
surface on the page and a second Apply that could disagree with the first while a task runs. What
the page does keep:

- the Services card marks a saved-but-not-applied service with the small pending pill ("Changed
  settings are waiting to be applied."), and the attention list never reports it as down;
- the hero never counts pending as a problem.

The existing assertion "pending changes are not repeated here" stays true.

---

## 7. Section 4: capacity ("Storage")

Card: `section` named "Storage" (`DashboardCard` reskinned; the region name is unchanged).

- **Header meta**: with a Warning or Critical item, the worst `StatusPill` and "1 of 3 file
  systems: Warning" (existing `dashboard.storage.rollUp`); otherwise "3 file systems" (new
  `dashboard.storage.count`). No OK roll-up (phase-5 1.2.1).
- **Rings**: the first four of `storageItems()` (worst first, then fullest), in a list
  `repeat(auto-fill, minmax(15rem, 1fr))` (two across in the 7-column card, one per row at 390px).
  Each is a `CapacityRing`:
  - `label`: "System drive", the label, or the device as `Identifier`; a ZFS pool "ZFS pool tank";
  - `value` = `percentage`, `max` 100, `figure` "87%", `valueText` the existing "87% full ·
    120 GiB free of 916 GiB";
  - `threshold` Warning or Critical with the fixed word, only when crossed (1.2.3);
  - children: "Warns at 85%" or "No warning level set"; for the system drive "Where openmediavault is
    installed"; for a pool "3 file systems share this space"; the comment, if any, as text with
    `dir="auto"`, two lines at most;
  - a reading of -1: `value={null}`, valueText "Could not read how full it is" (the ring's dashed
    Unknown form);
  - a missing file system: dashed ring with a **Critical** pill and "Not found. Its disk may be
    disconnected or have failed." (new). The ring cannot draw this yet (gap G3a); until it can, the
    item is a `HealthListItem` with the Critical pill under the rings.
  - Each ring with a page is a link tile, "Open file system Data", to `/storage/filesystems/$fs`
    (gap G3b). The system drive and an unlinked pool are not links.
- **The rest**: `Disclosure` (inline) "Show all 6 file systems" / "Show fewer", then the remaining
  items as `CapacityMeter variant="compact"` rows with the same words. Problems are first by the
  sort, so they are never behind it.
- **Footer**: "Open File systems" → `/storage/filesystems`.

States:

| State | What shows |
| --- | --- |
| Loading | four ring skeletons (circle and two text bars, G6), `aria-busy`, polite "Loading the file systems…" |
| Error, never read | `ReadFailed` "Could not read the file systems." with the server's message and "Try again" (foreground reads of both lists, as today) |
| Stale | `CardStaleLine` "Could not update since 10:42." under the header, items kept |
| Empty | `EmptyState`: "No file systems are mounted. A file system holds your files on a disk; you create one under File systems." with "Add storage" |
| Normal user | absent; no call made |

---

## 8. Section 5: live activity ("Right now")

Administrators only. A normal user's page neither mounts it nor calls `useLiveSamples()`, so no
chart registers demand and the shell keeps its single read (`liveInterval` returns false for a
non-admin anyway).

### 8.1 Composition and the lazy boundary

A card `section` "Right now" with three tiles. Each tile: the name (`text-sm`, medium,
`muted-foreground`), the `LiveFigure` (main entry, no Recharts), the plot, and one secondary sub-line.

- **The plots are lazy.** `dashboard/liveCharts.tsx` is the only module of this page that imports
  `@omv-webui/react-ui-components/charts`. It exports `ProcessorChart`, `MemoryChart`,
  `NetworkChart` and `LiveReadings`; the page takes each with `React.lazy(() =>
  import("../../dashboard/liveCharts.tsx").then((m) => ({ default: m.ProcessorChart })))`, so they
  share one chunk. Each sits in `Suspense` whose fallback is a `Skeleton` of the plot's exact height
  (`h-26`, 104px), so nothing moves when the chunk lands. Names, figures and sub-lines render at once
  from the main chunk.
- The PR that ships this adds Recharts' four inert URL strings to `ALLOWED_URLS` in
  `tools/build-check/check.mjs` (journal 2026-11-24) and the build check confirms Recharts is not in
  the entry chunk.

Layout inside the card: three tiles across when the card is 560px or wider (container query),
stacked otherwise. In the 5-column card at wide they stack, each tile a row: name and figure at the
start, plot filling the rest.

### 8.2 Data

`useLiveSamples()` gives `system`, `traffic` and their spans. While the page is mounted the shell
reads every 2 s; on other pages every 10 s; never while the tab is hidden (`liveDemand`).

| Tile | Figure | Plot (`LiveChart`, `size="tile"`) | Sub-line |
| --- | --- | --- | --- |
| Processor | newest `cpu`, unit "%" ("<1" under 1) | one series "In use", brand trace with area, `domain={[0, 100]}`, ticks 0/50/100 | "Average load 0.23 · 0.09 · 0.02" (existing `loadValue`), then an inline `Disclosure` "What is average load?" holding the existing hint ("How many tasks wait for the processor on average. Below 4, the number of processor cores, the NAS keeps up." or "Lower means less busy.") |
| Memory | newest `memory`, unit "%" | one series "In use", brand trace with area, `[0, 100]` | "347.8 MiB of 3.8 GiB in use" (existing `memoryValue`) |
| Network · `enp2s0` | two `LiveFigure size="readout"`: "In 1.2", "Out 0.3", one unit for both | two series "In" and "Out", series colours with their own dashes (the chart's theme), `domain="nice"`, a `Swatch` key under the plot | the interface name as `Identifier`; it is the interface this page most likely uses (`standing(...) === "this"`, as the Network card marks it), else the first connected one that is not virtual |

- **Units**: rates in binary units with one decimal; the unit is chosen once per render from the
  highest reading in the window (KiB/s, MiB/s or GiB/s), shared by the figures and the axis, so a
  glide never changes unit midway.
- **Window and gaps**: `windowMs` one minute, `narrowWindowMs` 30 s, `intervalMs` 2 000. Set
  `maxGapMs` to 25 000 (2.5 times the 10 s page interval), so the samples taken on other pages before
  the reader arrived join into a line instead of a row of lone dots. A hidden tab still breaks the
  line, honestly.
- **Card header meta**, built from `systemSpan`: "Live, read every 2 seconds. Showing the last
  58 s." (new). It states the real span, never the window's capacity.
- **Readings**: one inline `Disclosure` at the card foot, "Show the readings" / "Hide the readings",
  holding `LiveTable` of the samples in the window, newest first, a column per figure, table name
  "Readings shown above, newest first" (new), and a "No readings" row where the line breaks.
- **Text alternatives** (`describe`): "Processor over the last 58 s: now 12%, highest 40%, lowest
  3%." and likewise for Memory; Network: "Network on enp2s0 over the last 58 s: in now 1.2 MiB/s,
  highest 4.0 MiB/s; out now 0.3 MiB/s, highest 0.9 MiB/s." The table carries the numbers.

### 8.3 States

| State | What shows |
| --- | --- |
| No sample yet (a fresh sign-in, the first reply in flight) | the plot's `emptyLabel` "Waiting for the first reading…", figures "No reading" in words, never 0 |
| One sample | a lone point with its head dot; the caption says "Showing the last 0 s"; reads as "just started", which it is |
| Network, one counter reading | figures "Waiting for a second reading" (a rate needs two); plot empty label the same |
| A figure missing from a reply | a gap in the line; "No reading" in the figure and the table |
| Poll failed | header meta becomes "Could not read since 10:42:07." (`role="status"`, announced once); figures and lines stay as last read; the line simply stops |
| No connected interface | the Network tile says "No connected network port to show." with "Network interfaces" link; Processor and Memory stay |
| Chunk failed to load | the tile's plot area says "The chart could not be loaded." with a "Try again" that retries the import (an error boundary around the `Suspense`); figures keep working |
| Normal user | absent |

---

## 9. Section 6: disks (DriveBay)

Card `section` "Disks" (was "Disk health"; the Disk health pages keep their name).

### 9.1 Data

- **The slots** come from `useDiskList()` (DiskMgmt.getList, foreground on open, never polled, never
  wakes a disk), in device order (`byDeviceOrder`). This is a new read for the dashboard, from the
  existing contract. Slot fields:
  - `id` and `device`: `devicename` ("sda"), mono;
  - `kind`: "ssd" for an `nvme` name; otherwise the generic disk face (gap G1c). DiskMgmt.getList
    has no rotation rate, so the page does not guess hard disk or USB;
  - `status` and `statusLabel`: from the session's check result, matched by `canonicaldevicefile`;
    before any check, Unknown "Not checked"; a disk the check did not list, Unknown "No reading";
    `BAD_STATUS` or an unrecognised value, Unknown "Unknown";
  - `role`: short words from `diskUse` via `useDiskInventory()` (the same cached reads as the Disks
    page): "System", the file system's label, "RAID md0", "Pool tank", "Swap", "Empty", "Being set
    up", "Being wiped". **Fail-closed**: while the inventory is not "known" (loading or any read
    failed), the role is left out, never "Empty", so the picture never suggests a disk is free;
  - detail (gap G1b): the temperature "34 °C" from DiskMgmt.getList when it has one, or "Asleep" for
    a disk in standby or sleep (`isAsleep`), which also tells the reader why checking will wake it.
- `name` on the chassis: the host name, mono.
- **The check**: `useDiskCheck` and the `diskHealth` store, unchanged: Smart.getListBg as a task,
  only on the reader's press, kept for the session.
- At most **twelve slots** show; more: "And 8 more disks" (link to Disks) after the bay.

### 9.2 Composition

1. Header: title "Disks"; meta and the one button (end of header, wraps under 640px):
   - before a check: "4 disks · health not checked yet", button **"Check disk health"** (secondary);
   - checking: "Checking disk health. You can leave this page; the result is kept." (existing), the
     button "Checking…" with its spinner, focus kept on it;
   - after: the worst `StatusPill` and the roll-up "1 of 4 disks: Warning" or "4 disks: OK"
     (existing `diskCheck.*`), then "Checked at 10:42. The readings do not update by themselves.",
     button "Check again".
2. `DriveBay`, `aria-label` "The disks in this NAS". Each slot links to `/storage/disks/$disk` when
   `isDiskName` passes (gap G1a).
3. After a check: the monitoring remark, when it applies (existing "Monitoring is off for 2 of 4
   disks." / "...for every disk..." with "Set up disk monitoring").
4. Inline `Disclosure` **"Why do I have to ask?"** (before the first check only) holding the existing
   sentence: "Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep
   to save power; the disk spins up, which takes a few seconds."
5. Inline `Disclosure` **"Disk details"** (after a check) holding today's `HealthList` of the check:
   model and size, temperature, the reason sentence, "Monitoring off", an unrecognised reading in
   mono, each disk's link. Technical detail one disclosure away (foundation 12).
6. Live region: the existing "Disk health checked: {{summary}}" announcement, once per result.
7. Footer: "Open Disks" → `/storage/disks`, "Open Disk health" → `/storage/smart/overview`.

### 9.3 States

| State | What shows |
| --- | --- |
| Disk list loading | four caddy-shaped skeletons (gap G6), polite "Loading the disks…" |
| Disk list failed | `ReadFailed` "Could not read the disks." with "Try again"; the check button still works, and a result then shows as the `HealthList`, not the bay |
| No disks | `EmptyState` (existing `disks.empty`) |
| Check failed | `InlineAlert` "Could not check disk health." with the server's message; button "Check again"; a previous result stays and says when it was read |
| Check listed no disk | slots Unknown "No reading", and the existing sentence "No disk reported its health. Some USB enclosures and virtual disks do not pass health readings through." |
| Normal user | absent; no call |

---

## 10. Sections 7 and 8: first steps, and the rest

### 10.1 First steps

`SetupChecklist`, reskinned, shown while `displayWelcomeMessage` is true (unchanged), region renamed.

- Header: a small progress ring (gap G3c) with "1/2"; title **"First steps"** (`h2`); description
  (new) "Six things to check on a new NAS, each read from its current settings."; a plain button
  **"Hide first steps"** at the end.
- Progress counts only the steps the NAS can confirm, the ones whose state is Done or Not done
  (HTTPS and email alerts): "1 of 2 done" as the ring's value text, with the caption (new) "Counts
  the steps the NAS can check for itself." The password (never confirmable), updates, name and time
  zone (values only the reader can judge) are not counted, so the ring never claims progress it
  cannot see.
- Items: today's six `ChecklistItem`s in their fixed order, with today's words and marks (neutral,
  no status hue: configuration, not health). A not-done item's link is drawn as a secondary button
  with the external mark (`ExternalLink` with `buttonClass({ variant: "secondary" })`), so the next
  step looks pressable at rest; done and value items keep a plain link.
- Hide: today's `ConfirmDialog`, focus on Cancel, with the copy renamed: title "Hide first steps?",
  body "They are hidden for every administrator, on every computer, and the classic interface's
  welcome panel goes too. This interface cannot show them again.", confirm "Hide first steps",
  cancel "Cancel"; failure "First steps were not hidden."; toast "First steps hidden." Focus moves to
  the page title afterwards (existing).
- Each item's read fails on its own, with "Not checked" and a retry on that item (existing).

### 10.2 Services, Network, System

Raised cards with a footer link; not whole-card links, because they hold links inside.

- **Services**: today's content and states (on services worst first with OK, Critical or pending
  pills; "Off: …" in one line; "No services are on. Turn on SMB/CIFS or NFS to share folders with
  other computers."; "No services were reported."; loading, failed, stale). Footer "Service details".
- **Network**: today's content and states (each interface linked to its page, the "This page" mark,
  connected speed or "Not connected" as a fact, IPv4 and IPv6, the virtual count line). Footer
  "Network interfaces".
- **System**: Name (mono), openmediavault version, Running for, Time on the NAS, Updates with "Review
  updates in the classic interface". Inline `Disclosure` **"Technical details"** (new) holding
  Processor and Kernel, in mono where they are identifiers, and "More system details in the classic
  interface". The never-read alert lives here (section 4.3).

### 10.3 What moved where (every current fact kept)

| Today | Now |
| --- | --- |
| Usage card: processor and memory meters | Right now: Processor and Memory figures with their charts; the memory sentence as the tile's sub-line |
| Usage card: load average and its hint | Processor tile sub-line; the hint in "What is average load?" |
| Usage chart, "Show the readings" | Right now, one readings disclosure for the three tiles |
| Freshness line under the page | Hero kicker |
| Disk health card: intro paragraph | "Why do I have to ask?" |
| Disk health card: per-disk list | "Disk details", after a check |
| Storage card: six meters | four rings, the rest as meters behind "Show all" |
| System card: processor, kernel | "Technical details" |
| Attention rows | Action cards, with new titles over today's sentences |
| Set-up checklist | First steps, with progress |

---

## 11. A normal user's dashboard

A normal user gets only the host name and the time from the server. The page makes none of the
administrator's reads (no storage, services, network, disks, live samples or chart chunk).

```
Dashboard                                           (eyebrow h1)
Hello, example-user                                 (display; "Hello" when the name is unknown)
You are signed in as example-user, with user rights.
+--------------------------------+ +--------------------------------+
| Your account                 > | | This NAS                       |
| Change your password or your   | | Name           nas             |
| details.                       | | Time on the NAS  Thu Nov 19 …  |
+--------------------------------+ +--------------------------------+
```

- "Your account": `Card variant="action"` to `/account/settings`, name "Your account" (the test's
  link name), description (new) "Change your password or your details."
- "This NAS": `section` with `FactList` Name (`Identifier`) and Time on the NAS; loading skeletons;
  the never-read `LoadFailed` with "Try again", as today.
- Two columns from 600px, stacked under.

---

## 12. Colour (foundation 3.6)

Every combination on this page takes a place in the scheme; no new colour.

| Element | Colour | Place in the scheme |
| --- | --- | --- |
| Page and hero ground | slate page with the ambient light (brand-400 at 10% dark / 12% light) | base |
| Health ring OK segments, OK pills, OK slot lights | OK fill and label | quarter turn |
| Warning and Critical pills, ring segments, card washes, slot lights | warning and critical fills, labels, strokes, `*-wash` | attention arc |
| Unknown and Disabled | `unknown-stroke`, dashed, hollow | neutral |
| Capacity arcs and meters | `usage` on `usage-track`; warning or critical fill only with its pill | base, then attention arc |
| Processor and Memory lines | `trace` with `trace-area` | base |
| Network In and Out | two chart series with their own dashes | the gaps |
| Links, next-step words, focus | action label, focus ring | base |
| Drive bay chassis | `art-chassis-top` to `-bottom` | grounds (material light) |
| Pending | only the shell's band and the small pending pill in Services | split complement, navy ink |

Rules applied here:

- **One wash per non-OK element**: each status card is lit in its own state; the hero is never
  washed (its pill and ring carry the state), so a critical NAS does not paint the hero and the card
  for the same problem. The Storage, Disks and Services cards carry pills, not washes.
- **Words are labels, never fills**: every status word on a ground takes `*-label`; words on a pill
  take its foreground, navy on the light fills.
- **Headline ink is `foreground`** in every state.
- Worst case on one screen: slate, blue, OK green, warning orange, critical red, the band's gold and
  two series. All have jobs; no other hue appears.
- **Never colour alone**: ring segments have the legend's icon and word; slot lights the icon and
  word under the caddy; lines their dash, key and table; cards their pill word.
- **Both themes**: dark first (night slate, cards one step lighter with the inner top highlight);
  light is a cool page with white cards. The audited pairs already cover every pair here (washes over
  `surface`, labels on washes, the trace over its fill on a card, series on the plot grounds, the
  chassis). Nothing on this page needs a new audit pair; if the hero's kicker pill is drawn over the
  ambient light, that pair (pill edge in the light ambient light, 3.15:1) is already measured.

---

## 13. Motion (foundation 7)

All from existing tokens and utilities; all cut under `prefers-reduced-motion` (end states say the
same in words).

| Motion | Where | How | Runs |
| --- | --- | --- | --- |
| Arrival of the page | hero | `animate-rise` (fade and rise 12px, enter curve, `duration-slow`) | first mount only, not on polls |
| Ring draw | HealthRing | its segments draw in turn (`line-draw`, stagger) | first mount; later a segment that changes state crossfades its stroke (`duration-base`) |
| Cards settle in | attention cards | `animate-settle-in` with `stagger` and `--stagger-index` (capped at 10 by the token) | first mount; a card added later settles in alone |
| Card leaves | a resolved attention card | fades and collapses its height (`ease-exit`, `duration-base`) so the cards below close up instead of jumping (gap G7) | when a row disappears |
| Sections rise | the cards from Storage on | `animate-rise` with stagger by grid order, index capped at 6 | first mount |
| Ring fill and glide | capacity rings, meters | arcs grow from zero on entrance, then glide to each new reading (`duration-glide`) | built in |
| Value glide | live figures | `LiveFigure` tweens to each reading | built in |
| Live line | the three plots | moves one step left over one interval; head dot beats once per sample; still while pointed at or focused | built in |
| Disk check | the button | label to spinner ("Checking…"), then "Check again"; slot lights change from the hollow ring to their state in turn when the result arrives (gap G1d) | on the result |
| Disclosure | every "Show…", "Why…", "Technical details" | height on the soft spring, chevron on the settle spring | built in |
| Skeleton | loading | `animate-breathe` | only while loading |

Nothing loops except the skeleton and the spinner while work is really happening. No headline
typing effect, no count-up on the headline, no pulsing of critical cards: a critical state is
unmistakable by its words, pill, wash and position, and pulsing would only add alarm.

---

## 14. Gaps in the library (for the design-system-engineer)

Each with all states, both themes and a story; none is a one-off style in the page.

| # | Component | Gap | Why the page needs it |
| --- | --- | --- | --- |
| G1a | `DriveBay` | a slot can be a link (`href` or `render` per slot), with hover, focus ring and active states that do not fight the LED | each slot leads to its disk's page |
| G1b | `DriveBay` | an optional `detail` line per slot (temperature, "Asleep"), `tertiary-foreground`, under the role | today's facts (temperature) and the honest "Asleep" |
| G1c | `DriveBay` | a generic `kind: "disk"` face for when the type is not known | DiskMgmt.getList has no rotation rate; drawing a hard disk or USB stick would be a guess |
| G1d | `DriveBay` | a state change after mount animates the slot lights in turn (crossfade on `duration-base`, stagger), reduced-motion cut | the disk check's result lands visibly |
| G2 | `Card variant="action"` | an external form: the external mark in place of `CardChevron`, and the visually hidden "(opens in a new tab)" in the name, with `target` and `rel` set by the component (UI-3) | attention cards that lead to the classic interface |
| G3a | `CapacityRing` | a "no reading but known bad" state: dashed ring **with** a Critical or Warning pill and the words (today `value={null}` always draws Unknown and suppresses the pill) | a missing file system is Critical, not Unknown |
| G3b | `CapacityRing` | a link tile form (render as a link, hover on `muted`, focus ring round the tile, chevron) | each ring opens its file system |
| G3c | `CapacityRing` or a new `ProgressRing` | a ring-only layout labelled by an outside heading (no `beside` words) | the first-steps progress, whose name is the card's title |
| G4 | new `LiveTile` (main entry) | the story-only `Tile` (name, `LiveFigure`, plot slot, sub-line) as a component, with a skeleton of the exact plot height for a lazy `Suspense` fallback, and a stacked and a row layout by container width | the three tiles, without Recharts in the entry chunk |
| G5 | new `PageAnswer` (or `Hero`) | the top-page answer pattern: eyebrow title slot, kicker (pill, host, freshness), display headline, sub-lines, one optional action, an aside slot for a ring; wide, medium and narrow layouts; compact spacing | foundation principle 1: every top-level page opens with its answer, so Storage and the others will reuse it |
| G6 | skeletons | `HealthRing` and `CapacityRing` loading forms (track only, breathing, legend bars), and a `DriveBay` slot skeleton | loading states of the right shape (style guide: skeletons of the real layout) |
| G7 | motion | a shared exit utility for a list item that leaves (fade plus height collapse on `ease-exit`), the counterpart of `animate-settle-in` | a resolved attention card leaves without a jump |

Not gaps: the status words, the card tones, the disclosures, `LiveChart`, `LiveTable`, `Swatch`,
`HealthRing` itself, `EmptyState`, `ConfirmDialog`. App work, not library: `PageTitle`'s eyebrow
variant, the area and headline model, the short role words.

---

## 15. Copy for the catalogue (en)

New or changed keys; everything not listed stays as it is. Plurals in i18next form.

```
dashboard.hero.updated                 "Updated at {{time}}"
dashboard.hero.ringLabel               "Health of this NAS"
dashboard.hero.toFix                   "to fix"
dashboard.hero.checked                 "checked"
dashboard.hero.ok                      "OK"
dashboard.headline.many_one            "{{count}} thing needs you"
dashboard.headline.many_other          "{{count}} things need you"
dashboard.headline.noProblems          "No problems found"
dashboard.headline.ok                  "Everything is OK"
dashboard.headline.readFailed          "Part of the NAS could not be read"
dashboard.hero.worst                   "Worst first: {{title}}."
dashboard.hero.readFailedList          "Could not read: {{list}}."
dashboard.hero.disksNotChecked         "Disk health has not been checked since you signed in."
dashboard.hero.noStorage               "There is no file system yet, so the NAS has nowhere to keep files."
dashboard.hero.allChecked              "Disk health was checked at {{time}}. The rest is read while this page is open."
dashboard.area.storage                 "Storage"
dashboard.area.disks                   "Disks"
dashboard.area.services                "Services"
dashboard.area.system                  "System"
dashboard.area.nothingFull             "Nothing full"
dashboard.area.notChecked              "Not checked"
dashboard.area.checking                "Checking…"
dashboard.area.noReading               "No reading"
dashboard.area.allRunning              "All running"
dashboard.area.noneOn                  "None on"
dashboard.area.noneYet                 "None yet"
dashboard.area.restartNeeded           "Restart needed"
dashboard.area.readFailed              "Could not read"
dashboard.area.reading                 "Reading…"

dashboard.attention.more_one           "Show {{count}} more"
dashboard.attention.more_other         "Show {{count}} more"
dashboard.attention.fewer              "Show fewer"
dashboard.attention.added_one          "{{count}} new item needs attention."
dashboard.attention.added_other        "{{count}} new items need attention."
dashboard.attention.title.fsFull       "{{name}} is full"
dashboard.attention.title.fsMissing    "{{name}} is missing"
dashboard.attention.title.fsWarning    "{{name}} is almost full"
dashboard.attention.title.zfsDegraded  "ZFS pool <pool></pool> is missing a disk"
dashboard.attention.title.zfsUnusable  "ZFS pool <pool></pool> cannot be used"
dashboard.attention.title.zfsDamaged   "ZFS pool <pool></pool> has damaged files"
dashboard.attention.title.diskCritical "Disk <device></device> may fail soon"
dashboard.attention.title.diskWarning  "Disk <device></device> reported a problem"
dashboard.attention.title.serviceDown_one   "{{title}} is not running"
dashboard.attention.title.serviceDown_other "{{count}} services are not running"
dashboard.attention.title.restart      "The NAS needs a restart"
dashboard.attention.title.clock        "The clocks differ by {{duration}}"
dashboard.attention.fsFull             "Nothing more can be saved on it until you delete or move some files."
dashboard.attention.fsMissing          "Its disk may be disconnected or have failed. Shared folders on it cannot be reached."
dashboard.attention.fsWarning          "It is {{percent}} full, at or above its warning level of {{threshold}}."
dashboard.attention.zfsDegraded        "A disk in it is missing or has failed. Open the pool to see which one."
dashboard.attention.zfsUnusable        "None of its file systems can be reached."
dashboard.attention.zfsDamaged         "Open the pool to see which files."
dashboard.attention.serviceDown_one    "It is turned on, but it has stopped. Computers cannot use it until it starts."
dashboard.attention.serviceDown_other  "{{list}} are turned on, but have stopped. Computers cannot use them until they start."
dashboard.attention.restart            "Updates finish installing when it restarts. Restarting is in the classic interface, in the power menu at the top right."
dashboard.attention.restartLink        "Restart from the classic interface"
dashboard.attention.clock              "If the NAS clock is wrong, schedules and logs will be too."

dashboard.storage.count_one            "{{count}} file system"
dashboard.storage.count_other          "{{count}} file systems"
dashboard.storage.missingValue         "Not found. Its disk may be disconnected or have failed."

dashboard.live.title                   "Right now"
dashboard.live.caption                 "Live, read every 2 seconds. Showing the last {{span}}."
dashboard.live.stale                   "Could not read since {{time}}."
dashboard.live.cpu                     "Processor"
dashboard.live.memory                  "Memory"
dashboard.live.network                 "Network"
dashboard.live.inUse                   "In use"
dashboard.live.in                      "In"
dashboard.live.out                     "Out"
dashboard.live.noReading               "No reading"
dashboard.live.waiting                 "Waiting for the first reading…"
dashboard.live.waitingRate             "Waiting for a second reading"
dashboard.live.noInterface             "No connected network port to show."
dashboard.live.loadWhat                "What is average load?"
dashboard.live.describeOne             "{{series}} over the last {{span}}: now {{now}}, highest {{high}}, lowest {{low}}."
dashboard.live.describeNetwork         "Network on {{name}} over the last {{span}}: in now {{inNow}}, highest {{inHigh}}; out now {{outNow}}, highest {{outHigh}}."
dashboard.live.tableLabel              "Readings shown above, newest first"
dashboard.live.chartFailed             "The chart could not be loaded."
(reuse) dashboard.chart.showReadings, dashboard.chart.hideReadings, dashboard.chart.colTime, dashboard.chart.gap

dashboard.disks.title                  "Disks"
dashboard.disks.notCheckedMeta_one     "{{count}} disk · health not checked yet"
dashboard.disks.notCheckedMeta_other   "{{count}} disks · health not checked yet"
dashboard.disks.bayLabel               "The disks in this NAS"
dashboard.disks.why                    "Why do I have to ask?"
dashboard.disks.details                "Disk details"
dashboard.disks.asleep                 "Asleep"
dashboard.disks.more_one               "And {{count}} more disk"
dashboard.disks.more_other             "And {{count}} more disks"
dashboard.disks.openDisks              "Open Disks"
dashboard.disks.loading                "Loading the disks…"
dashboard.bay.role.system              "System"
dashboard.bay.role.raid                "RAID {{name}}"
dashboard.bay.role.zfs                 "Pool {{pool}}"
dashboard.bay.role.swap                "Swap"
dashboard.bay.role.none                "Empty"
dashboard.bay.role.creating            "Being set up"
dashboard.bay.role.wiping              "Being wiped"
dashboard.bay.role.notMounted          "{{name}}, not mounted"
(the role for a file system in use is its label alone)

dashboard.system.technical             "Technical details"

dashboard.user.headline                "Hello, {{username}}"
dashboard.user.headlineNoName          "Hello"
dashboard.user.accountTitle            "Your account"
dashboard.user.accountBody             "Change your password or your details."

checklist.title                        "First steps"
checklist.intro                        "Six things to check on a new NAS, each read from its current settings."
checklist.progress                     "{{done}} of {{total}} done"
checklist.progressHint                 "Counts the steps the NAS can check for itself."
checklist.hide                         "Hide first steps"
checklist.hideTitle                    "Hide first steps?"
checklist.hideBody                     "They are hidden for every administrator, on every computer, and the classic interface's welcome panel goes too. This interface cannot show them again."
checklist.hideFailed                   "First steps were not hidden."
checklist.hidden                       "First steps hidden."
```

Retired: `dashboard.fresh` ("Updated every 20 seconds…": no longer true, System.getInformation is
read every 2 s with the charts on screen), `dashboard.usage.*` (moved to `dashboard.live.*`, the load
strings reused), `dashboard.chart.title`, `dashboard.chart.notEnough`, `dashboard.chart.label`,
`dashboard.chart.readingsLabel`, `dashboard.disks.intro` stays (now inside "Why do I have to ask?").
All strings tolerate 40% growth: titles wrap, the ring's figure is two short lines, buttons wrap
under 400px.

---

## 16. Accessibility and keyboard

- Headings: `h1` Dashboard; `h2` Needs attention, Storage, Right now, Disks, First steps, Services,
  Network, System; `h3` each attention card's title.
- Tab order: skip link, band, top bar (shell) → `h1` is the focus target after navigation → the
  hero's button (if any) and "Try again" → each attention card (one stop each) → "Show 4 more" →
  each ring tile → "Show all" → "Open File systems" → "What is average load?" → "Show the readings"
  → "Check disk health" → each slot (up to twelve) → "Why do I have to ask?" / "Disk details" →
  footer links → first steps → the rest.
- Live regions: the kicker's stale line; the live card's stale line; "N new items need attention";
  the disk check's result. None of them speaks on every poll.
- Charts: `role="img"` with their text alternatives, plus the table. Slot lights and ring segments
  are decorative; the words beside them are the content.
- Targets: every link tile and card is far above 24px; the slot links are at least 44px tall.
- Every status has its word: ring legend, pills, slot words, card pills.

---

## 17. Tests whose expectations change (what the user sees)

Unit tests for the new model (`healthAreas`, `dashboardAnswer`, the slot mapping with fail-closed
roles) go in `dashboard.test.ts`. The page tests change as follows.

**`DashboardPage.test.tsx`**

- "shows what the NAS is and how busy it is": the System region's Processor and Kernel are inside
  "Technical details" (open it, or assert the disclosure's button). The **Usage** region is gone:
  the "Right now" region shows Processor and Memory figures (no longer `meter`s), "347.8 MiB of
  3.8 GiB in use" as the memory sub-line, the load line on the processor tile, and "Lower means less
  busy." inside "What is average load?". "Updated every 20 seconds. Last update …" becomes "Updated
  at …" in the hero. "Needs attention" absent and "waiting to be applied" absent: unchanged. New:
  the hero says "No problems found" and "Disk health has not been checked since you signed in."
- "lists a needed restart as a Warning, and a clock difference as advice": still two list items in
  the "Needs attention" region, now cards. The restart card has "Warning", the title "The NAS needs
  a restart" and the new sentence; its link is "Restart from the classic interface (opens in a new
  tab)" to `/`. The clock card has no Warning and its title "The clocks differ by …".
- "keeps the figures when a background poll fails": the stale text is unchanged and now in the hero
  kicker; "Try again" is there; recovery shows "Updated at …".
- "says plainly when the information has never been read": unchanged (the alert is inside the System
  card, which keeps its region).
- "sends no state-changing call on load": still true; the dashboard now also reads DiskMgmt.getList
  and the disk-inventory reads, all `get`/`enumerate` reads, and still never Smart.getListBg.
- normal user: "This NAS" and its two facts unchanged; "You are signed in as example-user, with user
  rights." unchanged (now the hero's sub-line); "Your account" is a card link with the same name and
  address. Add "Right now", "Storage" and "Disks" to the regions that must be absent.
- checklist tests: the region is named **"First steps"**, not "Set up your NAS"; the six item titles
  and their states are unchanged; the hide button is "Hide first steps", the dialog "Hide first
  steps?", the toast "First steps hidden."; focus still moves to the page title. New: the progress
  "0 of 2 done" or "1 of 2 done" per scenario.

**`DashboardPage.monitoring.test.tsx`**

- Storage: items are rings (still `meter`s with the same value text and "Warns at" lines). "Shows six
  file systems, the rest behind a disclosure" becomes **four**. The roll-up line is in the header. A
  missing file system shows Critical with "Not found. Its disk may be disconnected or have failed."
  The footer link is "Open File systems".
- Disk health: the region is **"Disks"**. "Reads nothing until asked, says why": the why is behind
  "Why do I have to ask?"; nothing is read until "Check disk health" is pressed (the one in the card;
  the hero has one too in this state, so the test queries within the region). After the check: the
  roll-up in the header; the per-disk list behind "Disk details"; the bay shows each disk's word.
  "Says every disk is fine…", "no disk reports its health", "a reading it does not know, in mono" and
  the failure test keep their words, now in the bay's card and its details. New: before a check,
  every slot reads "Not checked"; DiskMgmt.getList is read and Smart.getListBg is not.
- Attention order: still four items in the same order; the text starts with the pill then the new
  title ("CriticalSSH is not running", "Warning/dev/sda1 is almost full", "WarningThe NAS needs a
  restart", "The clocks differ by").
- Services and Network cards: unchanged words; the network card's links unchanged.
- "Polls every card in the background": unchanged for the four cards. "Makes none of these calls for
  a normal user": add DiskMgmt.getList; the absent regions are "Storage", "Disks", "Services",
  "Network", "Right now".
- "The Usage chart" is rewritten as "Right now": before the first sample, "Waiting for the first
  reading…" (a session already has the shell's first sample, so expect a lone point instead); after a
  second reply, three charts named "Processor", "Memory" and "Network" with their descriptions; "Show
  the readings" opens the table "Readings shown above, newest first" with a header row and a row per
  sample; the button becomes "Hide the readings".

**`DashboardPage.network.test.tsx`, `DashboardPage.rsyncd.test.tsx`**: unchanged; the attention
card's link keeps the name "Open the rsync server".

**Elsewhere**: no change from the page name (D1). `tools/build-check` gains the Recharts URL strings,
and a check that the entry chunk has no Recharts module.

---

## 18. The adversarial pass

Two walks through the main journey, and what each found (fixes are already in the sections above).

**As someone trying to break it**

1. *Zero of everything.* No file system: the headline had no honest answer; added the "No problems
   found / nowhere to keep files / Add storage" row and the "None yet" area. No service on: it would
   have dragged the roll-up to Unknown forever; it is now Disabled and left out of the roll-up.
2. *One sample.* A session that just started has one system sample; the chart draws a lone point and
   the caption says "the last 0 s", which is true. A rate needs two counter readings: added "Waiting
   for a second reading" so the Network figure never shows 0.
3. *Samples from other pages.* At 10 s apart they would have broken the line at the chart's default
   gap (2.5 times 2 s); set `maxGapMs` to 25 s.
4. *A thousand of something.* 1 000 file systems past their level: six cards, then "Show 994 more";
   the headline counts all. 64 disks: twelve slots and "And 52 more disks". 40 file systems: four
   rings, the rest behind "Show all" (today's behaviour).
5. *Long, right-to-left and markup-like names.* A 200-character label wraps in the card title and the
   ring label (never clamped where it carries a Critical state); server text goes through `isolate`
   or `IdentifierText` with `dir="auto"`, rendered as text (UI-2); a name like `<b>x</b>` shows its
   brackets.
6. *Refresh during a disk check.* The session store is memory only, so the page returns to "Not
   checked" and the hero says so; the earlier result is not claimed. A second tab has its own
   memory: same.
7. *The hero's button disappears under focus* (the check ends OK, or another administrator's
   change makes the state critical): focus would have been lost; it now moves to the headline.
8. *Another administrator hides first steps.* The card goes on the next poll; focus inside it moves
   to the page title (existing hook).
9. *The live chunk fails to load* (a stale cache after an upgrade): an error boundary keeps the
   figures and offers "Try again", instead of a blank card.
10. *A failed read looking calm.* Without fail-closed areas a failed services read would have shown
    no "not running" card and an "Everything is OK" headline; a failed read now makes its area
    "Could not read" and the headline "Part of the NAS could not be read". The bay's roles are
    left out while the inventory is unknown, so no disk is ever shown as "Empty" by mistake.
11. *Pending from another administrator.* The band shows it (shell); a service saved but not applied
    is not called down here; nothing on the page offers a second Apply.
12. *Session expiry.* Background reads never keep the session alive (UI-14), so the idle sign-out
    still happens with the charts running; live samples are cleared on sign-out.

**As someone who cannot see it**

1. *Tab through the page.* Order matches the reading order at every width (no grid reordering). Up
   to twelve slot links is a long run; accepted, since each opens a different disk, and the bay
   comes after the disk check button so the main action is reached first.
2. *What a screen reader hears on arrival.* "Dashboard, heading level 1", then the kicker and the
   headline in reading order. The headline is not a live region, so it does not chatter on polls; a
   new problem is announced once ("1 new item needs attention."), the stale state once, the disk
   check's result once.
3. *Whole-card links.* Their names were going to be the whole card's text; they are now the next
   step's words, with the title and sentence as the description, which keeps the names short and
   the meaning complete.
4. *Colour alone.* None: every segment, light, line and wash has a word, icon shape or dash beside
   it. The Network lines have dashes and a key, and the table.
5. *200% zoom.* The 1280px window becomes the narrow layout: ring under the headline, tiles stacked,
   bay at four across; no sideways scroll.
6. *Reduced motion.* Everything lands at its end state at once; the live line redraws in place.

---

## 19. Hand-off notes for the build

- Branch `redesign-dashboard`; one PR. The owner sees screenshots of: wide, medium and 390px; dark
  and light; comfortable and compact; and the states "attention" (critical and warning), "no
  problems, disks not checked", "everything OK after a check", "a read failed", "no file system",
  loading, and the normal user.
- Verify on the mock first (`pnpm dev:mock`), both themes, keyboard, reduced motion, 320px; the
  test VM only for what the mock cannot show (a real disk check, real rates).
- The library gaps (section 14) go to the design-system-engineer first, or in parallel; where one is
  not ready, the interim noted in its section applies (a missing file system as a list row), never a
  page-local style.
