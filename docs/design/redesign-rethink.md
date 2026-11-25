# Rethink: accent, forms, tables, icons and the dashboard

Design spec, redesign step 5 (follows the owner's review of the re-composed dashboard, 2026-11-25).
Branch `redesign-dashboard`.

**Status (2026-11-26).** The accent, the NAS map, the two forms and the two tables are prototyped in
the dev-only lab (section 8, prototypes 1 to 5) and the owner approved their direction. The motion
reel and guidance (prototypes 7 and 8) are being built (section 7.10 lists what style guide 10
changed in the motions); the icon sheet (6) is not built yet. Nothing has moved into the library or
the pages.

**What wins where they differ.** The owner decisions below override the rest of this spec.
[Style guide section 10](style-guide.md#10-the-generated-look-what-we-never-do) ("The generated
look") overrides both: wherever this spec still asks for an area chip, a pill, an eyebrow label, a
`·` separator, a numbered section or stepper, a sparkline, a "From your add-ons" tile row, a pulsing
or "live" dot, a left tone bar, or a count the backend does not give, the style guide's replacement
applies. Section 6.8 (the map as rows) replaces the lanes and lines of 6.2 C, 6.3 and 7.2. The lab
code (`web/apps/omv-web-app/src/lab/dashboard`, `forms`, `tables`) is the reference for what the
owner saw.

The "before" screenshots this spec names (`before-*.png`, `shots/dashboard-*.png`) were taken on the
mock in a working folder and are not in the repository. Re-take them with the lab's `?screen=`
links and the mock if needed.

---

## Owner decisions (2026-11-25) — these override anything in this spec

1. Accent: **Cobalt** (hue 258; light fill 600 `#0065da`, label 700 `#004faf`; dark edge 500 `#2c84ff`, label 400 `#65a3ff`; see web/packages/react-ui-components/src/foundations/accent-candidates.css). Roles exactly as section 1.2 ("do this" only); blue keeps links, selection, checked controls and focus.
2. Dashboard: the NAS map (section 6). Build it.
3. Both preferences: "Show tips" and "Animations: Full / Reduced".
4. Create flows: the button names the outcome ("Create Photos"); the summary says it takes effect at once. Behaviour unchanged.
5. **Fields are sized to their content (owner: "I don't want to see ridiculously long input fields for a small string").** Every input's width follows the length of what it holds: names and user names about 20–24ch, ports and numbers 6–8ch with the unit beside, IP addresses about 16ch (IPv6 about 40ch), sizes and percentages short with the unit, passwords about 24ch, dates and times their format. Only free text, descriptions, paths, comments and lists take the full column, and even then a form column is capped at a readable measure (about 640px), never the page width. Selects and choice groups size to their longest option. On narrow screens fields may grow to the column but never beyond it. This is part of the form pattern (section 3) and of FormSection/Field in the library.
6. Decisions 4, 5 and 6 of section 0 (the per-row reads, service output as a table, destructive confirmations in create flows) wait until the page that needs them; prototypes may show them but nothing ships without the owner.
7. Decision 9 (save settles without green): taken as proposed, since OK green is a status.
8. **Plugin content on the dashboard (owner, decided; the tile row is replaced by style guide 10, rule 14: ZFS and RAID are rows of the map, any other add-on is one line in the NAS's facts):** classic plugin widgets are YAML compiled into a static file, naming arbitrary RPC methods and rendering templates with HTML, so rendering them generically would break UI-2, UI-4 and UI-10. Instead: plugins this interface knows (ZFS and RAID now; others such as NUT once their methods join the contract) get native tiles in a region "From your add-ons" (after D, before E; full-width rows of same-size tiles, no holes; status in place; each tile ends in its action) and appear in their lane of the map (a ZFS pool in Storage, a plugin service in Ways in). Any other installed plugin gets a tile with its name and "Open in the classic interface". Never call a method a widget names; never fetch the widget file.
9. **The map is rows, not lines (owner, on the v4 map: "very hard to follow the connecting lines").** See 6.8: one row per storage (disks → storage → folders with their ways in), ways in and network as one band below, tracing by highlighting. Supersedes the five lanes of 6.2 C and the lane lines of 7.2.
10. **First visit remembered per browser, and it can be seen again** ("Show me around" in the dashboard footer and the account menu). See 6.8.
11. **Compact density hides the first steps' explanations** (and the lane captions and the welcome's second sentence). See 6.8.

## The first principle: welcomed, obvious, never in the way

The owner, 2026-11-25, above everything else in this spec: **"it really needs to make new users feel
welcomed and obvious how to use without getting in the way of pro users."**

Every pattern below (accent, forms, tables, icons, dashboard, motion) is tested against it by two
walks, and each pattern section ends with what this principle changed in it (1.4, 3.12, 4.10, 5.6,
6.7, and 7.1 rule 4).

### P.1 The two walks

**The newcomer**: a first-time owner who has never used a NAS. They bought a box, someone installed
openmediavault, and they want the family's photos on it.

| Test | Passes when |
| --- | --- |
| N1 What they see first | The answer in plain words and a picture of their own NAS. Never a menu of settings, a paragraph, or an empty grid |
| N2 How they know what to do | Exactly one thing on the screen carries the accent and says what it does with a verb and an object ("Add a shared folder"). Everything else that can be pressed looks pressable but plainer |
| N3 What reassures them | At each moment of doubt, one plain sentence says what is safe: "Nothing changes until you press Create." "Your files stay on the disk." "Undo is in the yellow bar." "You can change this later on the folder's page." Said where the doubt arises, not in a help page |
| N4 What they never need to understand | Listed per screen (P.4). Device paths, UUIDs, file system types, mount points, protocols, user numbers, the word "apply" before they have saved anything |
| N5 Words | The plain name first, the technical term second and in secondary text: "Windows and Mac sharing (SMB)", "Mirror (RAID 1)", "Standard (EXT4)". The technical term is always there, so instructions from a forum still match |

**The pro**: someone who runs NAS boxes, doing a routine task fast (share a folder with a Linux
machine, check temperatures, find what is eating the processor).

| Test | Passes when |
| --- | --- |
| R1 No tutorial in the way | No modal, tour, coach mark or forced wizard ever stands between a pro and a control. Guidance sits beside controls, never on top of them |
| R2 Keyboard | Every page and every action is in the palette (`/` or `Ctrl K`); every form submits with `Ctrl Enter`; every table is one tab stop with arrow keys |
| R3 Density | Compact density shows the technical identity (device, address) on the row's first line, mono, without a switch |
| R4 Details one step away | Technical columns, expanded rows, More options, copy buttons. Never two steps, never "in the classic interface" when the data is already loaded |
| R5 Guidance off | One switch, "Show tips", turns off every tip, caption and welcome for good (P.3). It is offered once, at the moment a pro shows they are a pro (P.3) |
| R6 Measured | A routine task's keystrokes are counted in the lab (section 8). Share Photos with a Linux computer: `/`, type "photos linux", `Enter` (opens the folder's Linux section with the home network prefilled), `Ctrl Enter`: under 15 keystrokes, no pointer |

### P.2 Two kinds of first visit

Most people who install this plugin already have an openmediavault NAS with folders and people. So
"first visit" has two meanings, and the welcome differs:

| Who | How it is known | The welcome |
| --- | --- | --- |
| **A new NAS** | From the NAS's state: no data file systems and no shared folders. Same for every administrator, needs no storage | Region A says "Welcome to your NAS" and "It is running. Here is what is in it, and what to set up first." The map (6.2, C) shows the disks it found and **ghost nodes** for what is not there yet (7.3). First steps move up under A and lead with "Add storage" (accent). Lane captions are on (P.3) |
| **A new interface on an existing NAS** | A per-browser "has seen the new interface" flag (UI-13: a preference, no server data) | Region A keeps its normal answer, with one line above it: "Welcome to the new interface. Your settings and files are the same; only the way you see them is new." with two plain links: "What is different" (a disclosure: the groups are as before, the palette, the map, the yellow bar is still the yellow bar) and "Open the classic interface". Dismissed with "Got it", or by doing anything on the page |

**Never** a modal tour, a spotlight, a "next tip 1 of 7", or a video. A newcomer learns from the
map and the one accent; a pro is never stopped.

### P.3 Guidance that fades

Four layers. Each says how it fades and what turns it off.

| Layer | What | Fades when | "Show tips" off |
| --- | --- | --- | --- |
| **G0 The interface itself** | Plain labels, the one-line hint under a field, the consequence summary, the status words, empty states' one sentence and action | Never: this is not guidance, it is the interface | Stays |
| **G1 Guidance keyed to the NAS's state** | Teaching empty states with ghost content (7.3), lane captions on the map while a lane is empty, first steps, the "Add storage first" page | When the state changes: the first shared folder exists, the step is done. Same for every administrator in every browser; it cannot nag, because it ends the moment it is no longer true | Empty states keep their sentence and action but drop the ghost and the caption; first steps become Shortcuts |
| **G2 Tips keyed to the person's first time** | One-line tips beside the thing they explain, each shown until its first success: "Saved. Your change waits in the yellow bar until you apply it." (first save), "Press / to go anywhere" (in the palette field's placeholder, until the palette is first used), "Point at a box on the map to see what it feeds" (until the first trace), the new-interface welcome | After the first success, or "Got it". A per-browser flag per tip (UI-13). At most one G2 tip on screen at a time | Never shown |
| **G3 On demand** | "Which should I choose?", "What is a workgroup?" disclosures, the `(?)` popover on a label, glossary popovers on technical terms | Never auto-open, never fade | Disclosures stay, collapsed to their `(?)` icon with the same name |

**"Show tips"** lives in the account menu beside Theme and Density, and in the palette ("Hide tips",
"Show tips"). It is a stored preference like the theme. It is offered once, without blocking, at the
moment a person shows they are a pro: the first time they switch to compact density or use a jump
key, a toast says "Compact view on. Hide tips too?" with **Hide tips** (stays until dismissed or 8
seconds, never again). Turning tips off never hides a control, a status, a consequence or a
technical value.

### P.4 What a newcomer never needs to understand, per screen

| Screen | Never needed | Where it still is, for the pro |
| --- | --- | --- |
| Dashboard | Device names, file system types, interface names, load averages | Node tooltips, compact density, the facts list |
| Add a shared folder | Path on the drive, file system type, SMB, NFS, user numbers | More options, the technical term after each plain name, the done panel's addresses |
| Add a person | SSH, shell, user ID, groups as a Unix concept | More options, the person's technical details |
| Add storage, RAID | Device paths, RAID level numbers, EXT4 versus XFS | Second line of each slot, the technical term on each card, "Other formats" |
| Disks table | Device path, serial, S.M.A.R.T. | Line two and technical columns |
| Logs, processes | Log names, PIDs, kernel threads | Technical columns, the "All" chip |
| Network | DHCP, CIDR, gateway, DNS | The technical term in brackets, the fact list with copy |

### P.5 The two walks through three journeys

**Newcomer, new NAS, first visit.** They sign in. Region A: "Welcome to your NAS. It is running."
The map draws itself (7.6): six disk caddies slide into the bay, the Storage lane shows a dashed
ghost "Your storage will appear here" with the caption "Storage is a disk made ready for files".
One accent button under A: "Add storage". They press it. Question 1 shows the same bay; the empty
disks are the only pressable slots. They pick one; the summary says "Erases everything on this
8.0 GiB hard disk (bay 3)" and "Nothing changes until you press Erase and add storage." They press
it, type the disk's name in the confirmation (the dialog shows them exactly what to type), and watch
the steps land. The done panel's accent is "Add a shared folder". On the dashboard the Storage
lane's ghost is now a real drive and the next first step is lit. They never saw a device path they
had to understand, never saw "apply", and were never stopped by a tour.

**Pro, existing NAS, routine task.** They open the new interface; the one-line welcome sits above
A, and they press `/` (which dismisses it, P.2). Typing "photos linux" offers "Share Photos with
Linux and Unix computers"; `Enter` opens the folder's Linux section with "Computers on my home
network (192.0.2.0/24)" chosen and focus on the access level. `Ctrl Enter` saves; the save bar
settles; the band says "1 pending change"; `/` "apply" `Enter` opens the apply confirmation. The
toast offers "Hide tips"; they take it. Nothing appeared on top of anything; every value they might
check (the export path, the options) was one disclosure away.

**Newcomer, existing NAS, "something is wrong".** An email says a disk has a problem. They open the
dashboard: A says "1 thing needs you: disk sdb reports a problem" in its largest type; B's row
"Disk in bay 2 reports a problem" has the accent button "See what to do"; in the map, the slot in
bay 2 has the Warning triangle and the line from it to "Data drive" and on to the three folders it
holds is lit (7.6), so they can see what is at risk without reading. The disk's page says in one
sentence what the warning means and what to do, with "Check it again" and "How to replace a disk" as plain next steps.

---

## 0. What the owner said, and what this answers

The owner's review, in five complaints, and the section that answers each:

| Complaint | Answer |
| --- | --- |
| "Missing an accent colour … monochromatic … needs an accent to draw attention to anything that requires [action] and main functions the user is expected to click on" | Section 1: the accent's roles. One hue, one meaning: *do this*. |
| Forms are "a pig with lipstick": nice CSS on a bad form | Section 2.2 (critique) and section 3 (the form pattern) |
| Tables are the same; "no thought is going into how the user will read the table and digest the information" | Section 2.3 and section 4 (the table pattern, applied to every table) |
| "Desperately needs more custom icons and diagrams … visually represent the action, intention and purpose" | Section 5: an icon set and a diagram for every flow that hides a consequence |
| Dashboard: "empty spaces in very awkward locations … without looking like it was designed by AI" | Section 6: a dashboard built around a picture of the NAS, in fixed regions that cannot leave holes |
| "Novice friendly without getting in the way of pro users"; "make new users feel welcomed and obvious how to use without getting in the way of pro users" | The first principle (above), tested by two walks in every pattern section |
| "Make use of clever and fun animations that are subtle and not annoying" | Section 7: motion that carries meaning, first-time flourishes that fade, and what was rejected |

### Decisions the owner must make before building

1. **The accent takes the primary action from the action blue** (section 1.2). Blue keeps links,
   selection, checked controls and focus. Agree or refuse.
2. **"Create" flows apply at once, and say so.** Add a shared folder and Add a person already run
   their steps and apply at the end (the job runner's last steps are "Save and share" / "Save and
   finish"), behind a button that says "Continue". The new button says "Create Photos" and the
   summary says "Takes effect when you press Create". This changes copy, not behaviour; it does
   change what the owner may expect from "save then apply". Agree.
3. **The dashboard becomes the map of the NAS** (section 6). It replaces the hero, the health ring
   and the card grid. Agree or refuse the direction before the lab prototype is built.
4. **Two columns cost reads.** "Who can open it" on the shared folders table and "Can open" on the
   people table need one privileges read per row (no new backend method; the reads exist). Proposed:
   read lazily for the rows on screen, at most 25; or keep both columns behind the technical switch.
5. **Service connections as a table** means reading the services' text output in the browser
   (section 4.9). It is text in, text out (UI-2 holds), but the output format can change between
   versions; it needs checking on the test VM and a raw-text fallback. Agree to try it.
6. **Destructive steps inside create flows** (Add storage and Create a RAID array format disks).
   Under the domain rule, the owner agrees the confirmation design (section 3.9) before it is built.
7. **"Show tips"** as a stored preference (P.3), offered once by toast when someone first switches
   to compact or uses a jump key. Agree, or keep tips always on.
8. **"Animations: Full / Reduced"** in the account menu beside Theme (7.1), on top of the system's
   reduced-motion setting. Agree.
9. **Save settle without green.** The foundation's catalogue turns a saved button OK green; OK green
   is a status. Proposed: the check draws and "Saved" shows in the button's own colours (7.1 rule 6).

---

## 1. The accent

The colour itself is being chosen separately. This section says where it goes, so one accent stays
meaningful.

### 1.1 Why the interface reads as monochrome

Measured on the screenshots, not felt:

- **Every interactive thing is the same light blue on navy.** In dark the action colour is the brand
  sky blue `#5dacdf` itself, and links, the current navigation item, the selected segment of every
  access control, checked boxes, radio dots, the focus ring, sort arrows, chart traces and the
  primary button are all that blue. On `before-form-add-shared-folder.png` there are 33 blue marks;
  the primary button ("Continue", bottom left) is one of them and not the largest.
- **The primary button is the weakest filled thing on the page.** Pale sky with navy words, 32px
  high, beside nothing; the outlined secondary buttons ("Apply to 7 shown") carry more contrast
  against the ground than it does.
- **Blue underlined links are everywhere**: every user and group name in the access grid, every
  device in the disk table, "Open File systems", "Open Disks". When everything is a link, the link
  colour stops saying "this is the thing to press".
- **Status is the only other colour**, and in the healthy state there is none, so a healthy page is
  blue-grey on blue-grey.

### 1.2 The accent's one meaning: *do this*

The accent marks **the action we expect this person to take here**, and nothing else. Blue keeps
"you can interact with this"; the accent says "this is the one to press".

**Earns the accent** (each is the filled `accent` with `accent-foreground` words unless said):

| # | Element | Rule |
| --- | --- | --- |
| A1 | The primary button of a view, dialog or flow | One per view. "Create Photos", "Add alex", "Save sharing", "Apply 2 changes" in the confirmation dialog (not on the gold band, which keeps its navy pair) |
| A2 | The next step on an item that needs the person | The button on each "Needs you" row on the dashboard and on page answers; on the dashboard only the worst row's button is filled, the others are outlined in `accent-stroke` with `accent-label` words |
| A3 | The current step of a flow | The step number disc of the step in progress in a wizard or job runner. Done steps are OK's check (status); later steps neutral |
| A4 | The first-steps progress | The filled part of the first-steps progress bar and the current step's button (A1 rule: one filled) |
| A5 | The action mark in a two-tone action icon on an accent element | The plus of "create", the arrow of "share", drawn in `accent-foreground` on the filled button. On a plain button the action mark is ink, never accent (5.2) |
| A6 | An empty state's create button | It is that view's A1 |
| A7 | The keyboard hint for the primary action | The `Ctrl Enter` chip inside the primary button, in `accent-foreground` at reduced weight |

**Never takes the accent:**

- Any status (OK, Warning, Critical, Unknown, Disabled, Stopped), any status icon, any health ring.
- Pending configuration (the gold), the pending band, the pending pill.
- The destructive confirm button (it is `destructive`, by form); a delete or wipe entry point.
- Links in running text, table names, breadcrumbs (they stay `action-label` blue or foreground).
- Selection (selected row, selected segment, checked box, radio dot, current navigation item, the
  current tab): blue. Selection is a state of a control, not a call to act.
- The focus ring: blue, so tabbing through a form does not paint the accent everywhere.
- Hover and pressed layers (neutral steps), backgrounds, cards, bands, headings, the brand mark,
  chart series, the live trace, decoration, gradients, illustration fills beyond A5.
- A secondary or plain button. A disabled control.

**Budget:** one filled accent element per region; at most three accent elements of any kind in a
viewport; under about 2% of the viewport by area. If a screen needs two filled accents, one of them
is not primary.

### 1.3 What the chosen colour must satisfy

For whoever picks the hue (colour-theory skill):

- A place in the scheme of foundation 3.6. The attention arc (27 to 87) is status and pending; the
  accent cannot sit there or it reads as a warning. The base (240) is the monochrome we are leaving.
  The gaps (118, 195, 292, 345) hold the chart series; whichever gap the accent takes, that series
  moves or the series and the accent never share a view (the dashboard has both: decide which).
- A full family in both themes: `accent`, `accent-foreground` (navy or white, 4.5:1 on the fill),
  `accent-label` (4.5:1 on all four grounds), `accent-stroke` (3:1 on all four grounds),
  `accent-hover` (a tonal step, not alpha), `accent-wash` only if A2's outlined button needs a
  hover ground. Pairs added to `PAIRS`; distances to every status fill, to pending and to the
  brand under all three deficiencies in `DISTINCT`, each at 10 or more (the accent never carries a
  status, but it sits beside them on the dashboard).
- It must be the most saturated thing on a healthy screen and less loud than Critical on an
  unhealthy one: Critical's pill and wash must still win the squint test.
- shadcn's `accent` name stays neutral (style guide 3.2). The new family is `cta` in code
  (`bg-cta`, `text-cta-foreground`) so the two are never confused. Style guide 2.1 and 3.4 ("there
  is no accent colour") change in the same pull request.

### 1.4 Under the first principle

The accent is the newcomer's answer to "what do I do?" (N2): on any screen, the one filled accent is
the next step. For a pro it is the default action of `Ctrl Enter` (A7) and the first item the palette
offers on that page. Because it is scarce it never needs a tip to explain it.

---

## 2. Critique

### 2.1 What every screen shares

These patterns repeat on every form and table, so fixing them once fixes most of the screens.

1. **The page is a document.** Each page opens with an H1, a two-line paragraph, sometimes a status
   sentence, then one long column. Explanation comes first, action last. The foundation's own rule
   ("show, then tell", one line of help, explanations on demand) is not applied to any form.
2. **One card holds everything, and its right half is empty.** Fields are 640px wide inside a card
   1100px wide (add shared folder, add person, add storage, RAID). Every field label, hint and radio
   line starts at the same left edge, so nothing groups visually.
3. **The hierarchy is flat.** Section titles ("Who can use it", 15px semibold) and field labels
   ("Name", 15px medium) are almost the same. The H1 names the parent ("Shared folders") while the
   card title names the task ("Add a shared folder"), so the largest words on the page are the wrong
   ones.
4. **Every option explains itself in full, always.** Each radio and checkbox carries a sentence of
   help that is always visible, in the same grey, at the same size. On the RAID page that is 9
   paragraphs before the person has chosen anything.
5. **Consequences are scattered sentences, not a summary.** "Windows and Mac sharing is off for the
   whole NAS. Sharing this folder turns it on." and "Only the people you give access to can open
   it." sit between controls, in body text, where they are read as more help.
6. **Nothing is drawn.** The library has DriveBay, Arrangement, ConnectionMap, DeletePicture and
   CopyDirection. None of them is used on a form or a list page. The RAID level choice, which is the
   one place a drawing removes real risk, is nine lines of text.
7. **No domain icons.** The app imports 50 lucide glyphs, all interface glyphs (chevrons, triangles,
   copy, eye). A disk, a folder, a person, a group, a service and a network port have no picture
   anywhere except the drive bay.
8. **Blue links everywhere** (1.1), including names inside forms that navigate away mid-form.
9. **Three or more save moments on one page.** The shared folder page has Description "Edit", "Save
   access / Discard changes", the SMB form's "Share / Cancel" and the NFS form's "Let them in /
   Cancel", each saving something different. The SMB page has "Turn on" and a separate workgroup
   "Save". The person cannot tell what is saved.

### 2.2 Forms

#### Add a shared folder (`before-form-add-shared-folder.png`)

The person brings one intent: "make a folder my computers can open". The form asks in the
backend's order (file system, name, path, description, privileges, SMB share), not theirs.

- **Novice.**
  - It opens with "File system" and a single radio button, "EXT4 on /dev/sda1". A choice of one is
    not a choice, and the label is the backend's name for a drive. "7.8 GiB free" is in small grey
    text under it, though it is the only fact a novice would choose by.
  - "Use another folder" is an orphaned link between Name and Description. It changes the path on
    the disk, which nobody needs on day one.
  - **The defaults contradict each other.** "Share it with Windows and Mac computers" is ticked, and
    every person and group is set to "No access". Left as it opens, the form makes a shared folder
    that nobody can open. On the folder's own page the same contradiction disables "Share" with the
    reason in small text under the button: "Give at least one person or group access first, above".
  - The access grid is 7 rows with 3 segments each, 21 buttons. The selected segment ("No access")
    is the blue-outlined one, so the eye reads "No access" as the highlighted, recommended choice.
  - The names in the grid are underlined blue links to each person's page. Following one leaves the
    form and loses what was typed.
  - The bulk row ("Search people and groups", "Show", "Set all shown to", "Apply to 7 shown") is a
    pro tool shown before anything else in that section.
  - "Also let in anyone on the network, without a password" has the same weight as "Show it in the
    network list". The one setting that opens the folder to every visitor looks like a preference.
  - **"Continue" commits.** It creates the folder, sets access, turns SMB on for the whole NAS,
    shares the folder and applies the change. The verb says "next page".
- **Pro.**
  - No keyboard path through the access grid other than tabbing 21 segments; Enter does not submit.
  - The path, description and SMB options are all on the first view; there is nothing to skip.
  - There is no summary to check before pressing Continue; the pro scrolls back up.

#### Add a person (`before-form-add-person.png`)

- **Novice.**
  - The order is identity, secret, contact, note, groups, folders, powers. "Administrator of this
    NAS", the most consequential choice on the page, is a plain checkbox at the bottom, at the same
    weight as "May sign in over SSH".
  - Groups are listed without saying what a group gives. "family" is a checkbox with "Everyone at
    home" under it; that it opens a4share is not said.
  - The password field says what a good password is in two lines; there is no strength indication
    and no "suggest one".
  - Email ("such as messages from scheduled jobs") is on the first view, though few people set it.
  - The same 3-segment access grid as above, with the same bulk controls, for one folder.
  - **Defect:** the SSH hint renders its placeholder as an identifier, "Lets `this person` sign
    in…", in mono, before a name is typed (`personCan.sshHint` with `addPerson.thisPerson` passed
    into the `<name>` element).
  - "Continue" again adds the person, gives access and applies.
- **Pro.** No summary of what the person will be able to do; no keyboard submit; email and
  description cannot be skipped past quickly because they sit between name and groups.

#### Windows and Mac sharing, Linux and Unix sharing (`before-form-smb-settings.png`, `…-nfs-…`)

- The answer ("Off") is a Disabled pill plus a sentence, then a card repeating "is off" with a
  "Turn on" button, then a workgroup card with its own Save. Two cards and three statements of one
  state.
- "Turn on" is the primary (light) button; "Save" for the workgroup is outlined; the two do
  different things at different times (turning on goes straight to pending; workgroup saves too)
  and nothing says either goes to the yellow bar.
- The shared folders section is an empty state centred in a 1100px void, with the inbox icon. It
  is the most useful part of the page (which folders are reachable this way) and looks like an
  error.
- "Who is connected now" floats on its own below the empty state.
- Pro: the protocol options a pro came for are "in the classic interface", in a footnote.

#### A shared folder's page and its sharing forms (`before-form-share-edit.png`, `…-smb.png`, `…-nfs.png`)

- **Status is dishonest.** The folder says OK twice (header pill and facts) while its file system
  is "Not available" and "Delete with all its files" is disabled because "Its file system /dev/sda1
  is not mounted". A folder on an unmounted file system cannot be opened; that is not OK.
- Four independent save moments (2.1 item 9). "Save access" and "Discard changes" are disabled
  ("Nothing to save") and sit below the grid with four lines of prose under them.
- The SMB form opens inline as a bordered box with its own title, four checkboxes with full
  sentences, a note about the whole NAS, and a disabled "Share" whose reason is a line below it.
- The NFS form explains how NFS trusts user numbers before asking anything. "Who may connect"
  offers "One computer" with an empty address field, though the NAS knows its own network
  (192.0.2.0/24) and could offer "Computers on my home network" with the range filled in.
- "Keep a copy of this folder…" (a copy job) is a lone link between NFS and Delete.
- The delete section is at the bottom of a long page, which is right, but "Remove, keep the
  files…" and "Delete with all its files…" are the same outlined shape; the difference is only in
  the words.

#### Add storage (`before-form-add-storage.png`)

- Disks are chosen by device path first: "/dev/sdb, VMware Virtual SATA Hard Drive, 8.0 GiB",
  three times, differing in one letter. Which physical disk is sdb is the question; the drive bay
  picture that answers it is on the dashboard, not here.
- "Empty disks" reassures, but formatting erases whatever is on the disk (it is "empty" because no
  file system was recognised). The consequence is never stated on this page.
- The way to combine disks is a paragraph with two inline links in the middle of the form ("To
  combine several disks, use Combine disks (BTRFS), or create a RAID array…"). A branch in the
  flow, hidden in prose.
- Four format radios at equal weight, each with a sentence; three of them a novice should never
  pick.
- Tags and "Warn when it is this full" are first-view fields; both have good defaults.

#### Create a RAID array (`before-form-raid-create.png`)

- The level choice is five radios and nine lines of text. It is the one decision on the NAS where a
  drawing ("what do I lose if a disk dies?") prevents data loss, and the Arrangement drawing exists.
- "Needs at least 3 disks" is said in text while the person has chosen 2; the option stays
  choosable. The usable space is said as a rule ("You can use the space of one disk") though the
  sizes are known (three 8.0 GiB disks: 8.0 GiB as a mirror, 16.0 GiB as parity).
- "Stripe (RAID0), no protection" has the warning triangle and the longest sentence, so it is the
  most eye-catching option on the page.
- The whole Add storage form repeats underneath (format, tags, warn level), making the page 1700px
  long. A novice cannot see where the RAID part ends.

#### A network interface (`before-form-interface-list.png`, `before-form-interface-edit.png`)

- "Change settings" opens the form below the facts card, so the facts (current address, router)
  scroll away just as the person needs them to compare.
- The consequence that matters most on the whole NAS ("will I lose this page?") is a 13px line under
  the Save button: "This page keeps working." When the answer is "This page stops working at
  192.0.2.128", it has the same size and place.
- The notice at the top ("This page reaches the NAS through a tunnel or on the NAS itself. It
  cannot tell which interface the tunnel uses.") is jargon for a novice and noise for a pro.
- IPv4 (3 radios) and IPv6 (4 radios) are equal; most homes never touch IPv6. "A fixed address I
  choose" shows nothing to prefill from the current lease.
- Pro: the facts are read-only rows with no copy controls; there is no diff of old and new.

### 2.3 Tables

For each: the question people bring, which column answers it today, and what goes wrong.

#### Shared folders (`before-table-shared-folders.png`)

- **Question:** "Which folders do I have, can people reach them, and how?"
- **Answer today:** none in one place. SHARING is empty for an unshared folder (blank, not "Not
  shared"). Who can open it is not in the table at all.
- FULL PATH (`/srv/dev-disk-by-uuid-0000…/a4share/`) wraps to five lines in mono and sets the row
  height. PATH repeats its last part. Both are technical columns on the first view.
- IN USE* is "No" with an asterisk footnote; nobody brings that question.
- Status OK for a folder whose file system is not mounted (2.2).
- A three-line paragraph under the search field explains the search's quirks.
- "Add a shared folder" floats at the far right, vertically between the search label and its hint.
- Pagination controls and "Rows per page 25" for one row.
- No row actions, no selection, no icon, no narrow layout.

#### People (`before-table-users.png`)

- **Question:** "Who can use the NAS, and what can each person open?"
- **Answer today:** half. GROUPS answers indirectly; what each can open is not shown.
- "None" appears in 15 of 36 cells. ADMINISTRATOR and SSH are two Yes/No columns whose "Yes" is
  the rare, important case and looks identical to "No".
- "(you)" is a grey word after a link; the administrator is found by reading a column.
- The "Who can control this NAS" card above the table is the right idea, set apart as prose.
- Names are underlined blue links: six blue links in a column carry no signal.

#### Disks (`before-table-disks.png`)

- **Question:** "Which disk is which, is it healthy, and what is on it?"
- HEALTH says "Not checked" as plain text, no mark: a status without its shape, against the fixed
  words rule (style guide 5.5; the dashboard calls the same state Unknown with a hollow ring).
- The temperature (30 °C) is tucked under the health word in one row only.
- USED FOR is three lines of prose for the system disk ("System disk (openmediavault runs from
  it) / File system EXT4 on /dev/nvme0n1p1, in use / …"). For empty disks it says "No file system
  found", where the useful thing is the next step: "Empty: add storage".
- The identity column is the device path in underlined mono. People know their disks by size,
  kind and position; the bay picture is not on this page.
- No grouping: the system disk, data disks, empty disks and a CD drive are one undifferentiated list.
- "Check disk health" sits at the end of a paragraph; "Look for new disks" and "Refresh" are two
  outlined buttons of equal weight.

#### File systems (`before-table-file-systems.png`)

- The best table today: status pills, a meter, numbers. Still:
- The meter is 60px wide and the numbers are a wrapped sentence ("10% full · 16.9 GiB free of
  19.5 GiB"), left-aligned, so two file systems cannot be compared by eye.
- USED BY says "Shared folders or other settings" on every row: a non-answer, explained by a
  footnote.
- "Found on the disks, not mounted" is a second table with a different column set and the only row
  action in the app ("Mount…").
- Three buttons of equal shape above the table ("Add storage" filled, "Combine disks (BTRFS)",
  "Refresh").

#### Processes (`before-table-processes.png`)

- **Question:** "What is using the processor or memory right now?"
- PROCESSOR is sorted, right-aligned, and correct. But the first row's command line wraps to ten
  lines in a column 450px wide and pushes everything else down.
- STATE "Finished, not cleared away (zombie)" wraps to five lines in a 100px column.
- USER wraps ("example-/user").
- Kernel threads (kworker…) fill the list; the pro and the novice both want them hidden by default.
- No bars: 87% and 0% look the same weight.
- The table re-sorts every 5 seconds under the pointer; the "Pause updates" button is the only
  defence.

#### System logs (`before-table-logs.png`)

- **Question:** "What happened, when, and was anything wrong?"
- The page opens empty ("Choose a log above to read it."), though one log (all system messages) is
  what almost everyone wants.
- The message column wraps without limit; one long line is 20 rows high.
- The full date "Nov 21, 2026, 2:29:37 PM" repeats on every row; the day is the same for hundreds of
  rows.
- The program that wrote the line ("kernel:") is inside the message, not a column to scan or filter.
- A right-to-left message is aligned to the right edge, so the row's reading line breaks.
- No way to filter to lines that mention an error.

#### Services status (`before-table-services-status.png`)

- **Question:** "Who is connected right now, and to which folder?"
- The answer is the raw `smbstatus` text in a code block: version banner, dashed rules, columns
  aligned by spaces, running off the right edge at 1440. A pro can read it; a novice cannot.
- Status "OK Running" is right; the rest of the page is a terminal.

#### RAID (`before-table-raid.png`)

- Same issues as disks: device identity, no picture of the array's arrangement on the list.

### 2.4 The dashboard (`shots/dashboard-*.png`)

- **Holes.** At 1440 there are two holes: right of the two attention cards (half the width, 200px
  high) and under the Disks card (600 by 750px), because First steps (1100px tall) sits in the right
  column beside Storage and Disks (800px). The bottom row (Services, Network, System) then starts
  below the tallest column, and its three cards end at different heights.
- **The AI look.** A centred-weight headline in a blank band, a ring top right with a legend, a grid
  of titled cards with "Open X" footers, a ring per file system, pills on everything. Each card has
  the same anatomy, so nothing is more important than anything else.
- **The order is not the visit.** Live charts (three tall line charts at 1% and 0.0) take the right
  column's prime space; the disks, the thing most likely to be wrong, sit lower left.
- **First steps is 1100px tall** for four checkbox items, each with a "Details" disclosure and a
  long outlined button.
- **Relationships are lost.** Storage, Disks, Services and Network are separate cards; the map that
  connects them (the single most useful drawing, foundation 14.4) is not on the dashboard.

---

## 3. The form pattern

A form is a conversation about an outcome. It starts from what is being made, asks the person's
questions in their order, shows the outcome as it takes shape, and says exactly what pressing the
button will do.

### 3.1 Anatomy

```
 Breadcrumb: Shared folders > Add a shared folder
 [icon 32] Add a shared folder                                     (H1, the task, 24px)
           A folder on the NAS that your computers can open.        (one line)

 ┌ QUESTIONS (8 of 12 columns, max 640px of controls) ─┐ ┌ OUTCOME (4 of 12, sticky) ───────┐
 │ 1  What is it called?                    (17px/600) │ │  [picture of the result]         │
 │    [ Name                            ]              │ │   drive -> folder -> ways in ->  │
 │    one-line hint                                    │ │   people                         │
 │                                                     │ │                                  │
 │ 2  Where are its files kept?                        │ │  What this does                  │
 │    [statement row or choice cards]                  │ │  - Creates Photos on Data drive  │
 │    > More options                                   │ │  - 6 people can read and change  │
 │                                                     │ │  - Windows and Mac: \\nas\Photos │
 │ 3  Who can open it?                                 │ │  ! Turns on Windows and Mac      │
 │    [preset choice cards] [people picker]            │ │    sharing for the whole NAS     │
 │                                                     │ │  Takes effect when you press     │
 │ 4  How will computers reach it?                     │ │  Create.                         │
 │    [toggle cards with icons]                        │ │                                  │
 │    > More options · 1 changed                       │ │  [ Create Photos   Ctrl Enter ]  │ <- accent (A1)
 └─────────────────────────────────────────────────────┘ │    Cancel                        │
                                                         └──────────────────────────────────┘
```

- **Title is the task**, with the object's icon (section 5) on a 32px plate. The parent page is in
  the breadcrumb, never the H1.
- **Questions, numbered.** A section heading is the person's question ("Who can open it?"), 17px
  semibold, with its number in a 24px disc (neutral; A3 gives the accent only to the current step of
  a multi-page flow, not to section numbers on one page). Sections are separated by 32px and a
  hairline, not by cards. Four sections at most on a create form; a fifth means a wizard (3.10).
- **The outcome rail** is sticky at 1024px and wider. It holds the picture, the consequence
  summary, the error summary when there is one, and the action bar. Below 1024px it becomes a
  sticky bottom bar (3.7).
- **Controls stay at 640px** so lines stay readable; the rail uses the width that was empty.

### 3.2 Start from intent: the outcome picture

Every create form and every sharing or access form shows a small drawing of the result, built from
the form's state and updated as the person types. It uses the map's language (foundation 9) at a
reduced size: the `LineageStrip` (new, section 8), a single horizontal chain of 3 to 5 nodes with
icons and short labels, lines between them, and the node being made drawn with the "new" treatment
(dashed until it has a name, solid after; the accent never: it is not an action).

| Form | Picture |
| --- | --- |
| Add a shared folder | Drive (free space) → **Photos** → Windows and Mac / Linux (off ones dashed) → people (avatars, "+3") |
| Add a person | **alex** → groups → folders, each with its access ("read and change", "read only") |
| Sharing on a folder's page | Photos → Windows and Mac `\\nas\Photos` → the people who can sign in |
| NFS on a folder's page | Photos → Linux and Unix → "Computers on 192.0.2.0/24" (one computer, a network, everyone, drawn as 1, many, all) |
| Add storage | Disk sdb (bay position) → "Erased and formatted as Standard (EXT4)" → **Data drive** → "ready for shared folders" |
| Create a RAID array | The Arrangement drawing with the chosen disks and the computed space, with "Show a disk failing" |
| Network interface | This browser → enp2s0 → NAS at old address / new address, with the cut shown when the page will lose the NAS |
| Copy job | CopyDirection, source → target, with the schedule |

The picture is `aria-hidden`; the consequence summary under it says the same facts in words
(foundation 9).

### 3.3 Sections by the person's questions, not the backend's fields

The rule: **order by what the person knows first**, group by what they are deciding, put the
irreversible things where they will be read (in the summary), and never ask a question the NAS can
answer.

- A choice of one is a **statement**, not a radio: "Files are kept on **Data drive** · 7.8 GiB free
  · Change". "Change" appears only when there is something to change to.
- A choice with consequences is **choice cards** (3.6), not radios with sentences.
- A field the person rarely sets goes into **More options** for that section (3.5).
- A field whose answer the NAS knows is **prefilled and stated** (the home network range, the
  current address for a fixed-address change, the most-free file system).

### 3.4 Smart defaults

Every default must be the right answer for a household and must never make the form produce
something broken. The defaults for the screens in this spec:

| Form | Field | Default | Why |
| --- | --- | --- | --- |
| Shared folder | Where | The mounted, OK file system with the most free space, not the system drive | The question nobody can answer without looking |
| Shared folder | Folder on the drive | Same as the name | Today's behaviour; the path is hidden in More options |
| Shared folder | Who can open it | "Everyone here can read and change files" when there are 10 people or fewer; otherwise "Only the people I choose" | Today's default produces a folder nobody can open |
| Shared folder | Windows and Mac | On | The common case |
| Shared folder | Linux and Unix | Off; when turned on, "Computers on my home network" with the range from the NAS's own interface | One computer with an empty field is a dead end |
| Shared folder | Show in network list / read only / recycle bin / guest | On / off / off / off, all in More options | Unchanged |
| Person | Password | Empty, with "Suggest a strong password" | |
| Person | Groups | None preselected; each group says what it opens | |
| Person | Role | "Uses shared folders" | Administrator is a deliberate choice |
| Person | SSH | Off, in More options | |
| Add storage | Format | Standard (EXT4); the others under "Other formats" | |
| Add storage | Warn when | 85%, in More options | |
| RAID | Level | Mirror if 2 disks, Parity if 3, Double parity if 4 or more | Recommended level follows the chosen disks |
| Interface | Fixed address | Prefilled from the current address, mask and router | |

### 3.5 Pro options behind disclosure

- **Per section, not one global "Advanced".** A `MoreOptions` disclosure at the end of the section
  it belongs to, named for its contents: "More options: folder location, description".
- **It says when it hides a change**: "More options · 1 changed". A pro who opened it once keeps it
  open: its open state is remembered per form in the session (UI-13 allows a preference; it holds
  no server data).
- **Nothing that can surprise is hidden.** Guest access lives in More options but, once on, its
  consequence is in the summary with the warning shape ("Anyone on your network can open it without
  a password").

### 3.6 Choice cards

For decisions with consequences: format, RAID level, IPv4 method, access preset, role.

- A card: a 24px icon or a small drawing (the arrangement glyph for RAID levels), a title, one line
  of what it means for the person, and a fact in mono or tabular where it helps ("8.0 GiB usable").
  A "Recommended" tag (neutral, with a check-star glyph) on one card at most.
- Selected: blue `selected` ground, blue edge 2px, the radio dot in the card corner. Never the
  accent.
- Unavailable: kept visible, `muted` ground, the reason in place of the one line ("Choose 1 more
  disk"), not focusable as a choice but readable.
- Four cards visible at most (uiux skill: a mutually exclusive choice caps at four); the rest under
  "Other choices".
- Keyboard: a radio group; arrows move, the card is the label.

### 3.7 The live consequence summary and the action bar

**The summary** is a list of sentences generated from the form's state. Each sentence is one fact,
with the object names in semibold and a 16px icon at its start. Order: what is made, who gets it,
how it is reached, side effects on the whole NAS, data that is lost, when it takes effect.

- Side effects on the whole NAS ("Turns on Windows and Mac sharing for the whole NAS") carry the
  info-neutral icon, not a status colour.
- Data loss ("Erases everything on sdb (8.0 GiB)") carries the warning triangle and the word
  "Erases" first, in `warning-label`. This is the one place a form shows a status-family colour,
  because the loss is real.
- **When it takes effect**, always last:
  - Create flows: "Takes effect when you press Create." (they apply as their last step).
  - Settings forms: "Saved changes wait in the yellow bar until you apply them."
  - Network: the ImpactLine in full ("This page stops working at 192.0.2.128. Open the NAS at
    192.0.2.50 after applying."), with its shape icon, at the top of the summary, not under Save.

**The action bar** is the last block of the rail (wide) or a sticky bar at the bottom of the
viewport (under 1024px), never covering a focused control (WCAG 2.4.11: the page reserves its
height).

- Primary: accent, verb and object: "Create Photos", "Add alex", "Save sharing", "Save network
  settings". While the object has no name: "Create shared folder".
- Secondary: "Cancel" (plain). On settings forms with changes: "Discard changes" (plain) and the
  primary "Save 2 changes".
- The narrow bar shows the first summary sentence and "Review" (opens the full summary as a sheet)
  beside the primary.
- States: idle; dirty (settings forms: the bar appears only when something changed, foundation 11);
  saving (spinner, "Saving…", both buttons unavailable, the form read-only); saved (check, "Saved",
  settles in 600ms, the pending pill takes the mark); error (the bar stays, the error summary appears
  above the button).

### 3.8 Help on demand, validation timing

**Help.**

- One line under a field, at most about 80 characters, always visible. Anything longer goes into a
  question-named disclosure under the section ("Which should I choose?", "What is a workgroup?") or
  a `(?)` popover on the label, keyboard reachable, text from the build (UI-2).
- Technical terms are second: "Windows and Mac (SMB)". A glossary popover on the term where it is
  first used on a page.

**Validation.**

- Format errors on blur (an address that is not an address). Never on every keystroke.
- Availability on a 400ms pause while typing ("A shared folder called Photos already exists"),
  read from data already loaded, never a new call per keystroke.
- **The primary button stays enabled.** Pressing it with problems shows the error summary at the
  top of the rail ("2 things to fix") with one link per problem that moves focus to the field, and
  focuses the summary (`role="alert"` once). Each field shows its error under it, linked by
  `aria-describedby` (style guide 5.3). A disabled primary hides the reason; this is the change from
  today's "Share" button. Exception: type-to-confirm, where the button is the confirmation.
- Cross-field problems are prevented by defaults, not reported: the access preset can never leave
  a shared folder with nobody.

### 3.9 What happens after pressing the button

- **Create flows** run in place: the rail's summary turns into the job runner (steps with the
  current step's number in the accent, A3), the questions become read-only and dimmed to
  `muted-foreground`. On success: the done panel with the address to copy, "Open Photos" (accent)
  and "Add another shared folder" (plain). On failure: the step that failed, the backend's message as
  text, "Try again" and what was already made.
- **Settings forms**: Save → the save bar settles → the pending mark flies to the top bar's pill →
  the gold band says what is pending → Apply (confirmation lists affected services and the
  connection warning) → task → result. Unchanged from style guide 5.8; the form only has to say it.
- **Destructive steps inside create flows** (Add storage, RAID, ZFS): the summary states the loss
  (3.7), and the primary button opens the type-to-confirm dialog (style guide 5.4) naming each disk
  by kind, size, model and bay position ("Erase sdb: 8.0 GiB hard disk, VMware Virtual SATA, bay
  3"), with the DeletePicture drawing of what is lost. The owner agrees this before it is built.

### 3.10 Keyboard for pros

- Tab order follows the sections; the rail is after the questions; the skip link "Skip to summary"
  is the first item in the form.
- `Ctrl Enter` / `Cmd Enter` presses the primary from anywhere in the form (shown in the button,
  A7). `Escape` with no changes leaves; with changes asks "Discard your changes?" (focus on Keep
  editing).
- Choice cards and segmented controls are radio groups (arrows).
- The people picker: type to filter, arrows to move, `Space` to add or remove, `1` `2` `3` to set
  "read and change", "read only", "no access" on the focused row.
- The command palette reaches every form and every "More options" setting by name ("Recycle bin
  for Photos").

### 3.11 The forms in this spec, redesigned

#### Add a shared folder

| # | Question | Controls | Pro |
| --- | --- | --- | --- |
| 1 | What is it called? | Name (focused on open). Hint: "Computers show the folder by this name. It cannot be changed later." | More options: Description ("Shown in lists, to tell folders apart") |
| 2 | Where are its files kept? | Statement row when one file system; choice cards with a capacity bar each when several, sorted by free space, unmounted ones unavailable with the reason | More options: "Folder on the drive" (default: the name) |
| 3 | Who can open it? | Three preset cards: "Everyone here can read and change files", "Everyone can read; some can change", "Only the people I choose". The second and third open the people picker below (people and groups as rows with an avatar, a name and one segmented control each; groups first, saying who is in them: "family · alex, sam, robin") | "Show as a table" switches to the full grid with bulk "Set all shown to" |
| 4 | How will computers reach it? | Two toggle cards with icons: "Windows and Mac (SMB)" (on), "Linux and media players (NFS)" (off). NFS on asks "Which computers?" (One computer / Computers on my home network (192.0.2.0/24) / Any computer) | More options: show in network list, read only for everyone, recycle bin, guest (guest says its consequence in the summary when on) |

Summary, in this order, for the default case:

- "Creates **Photos** on **Data drive** (7.8 GiB free)."
- "**6 people** can read and change files. Nobody else can open it."
- "Windows computers open it at **\\\\nas\\Photos**, Macs at **smb://nas/Photos**." (copyable)
- "Turns on Windows and Mac sharing for the whole NAS." (only when it is off)
- "Takes effect when you press Create."

Primary: **Create Photos**. Secondary: **Cancel**.

#### Add a person

| # | Question | Controls | Pro |
| --- | --- | --- | --- |
| 1 | Who is it? | Name ("They sign in with this name. It cannot be changed later."); "Who they are" (the description, "for example Alex at home") | More options: Email address ("For messages from scheduled jobs") |
| 2 | How will they sign in? | Password with a strength line ("Strong: 16 characters"), reveal, and "Suggest a strong password" (generated in the browser with `crypto.getRandomValues`, shown once, copyable). "Type it again" is shown only while the password is hidden. The UI-12 notice inline when not on HTTPS | |
| 3 | What can they open? | Groups as choice chips, each saying what it opens ("family: Photos, Music"). Then the folders as rows with the segmented access; a folder reached through a group shows "through family" and its level | "Show as a table" |
| 4 | What may they change? | Two role cards: "Uses shared folders" (default) and "Administrator of this NAS" (shield icon; one line: "Can change every setting, and read and delete every file") | More options: "May sign in over SSH" |

Summary:

- "Adds **alex**, who signs in as **alex**."
- "Can open **Photos** (read and change) and **Music** (read only), through **family**."
- "Cannot change the NAS's settings." / with the role: "Can change every setting on this NAS." (shield)
- "Takes effect when you press Add."

Primary: **Add alex**.

#### Windows and Mac sharing (the service page pattern; NFS, rsync and SSH follow it)

- Header: the service icon (32px plate), "Windows and Mac sharing", the state as status (Running /
  Stopped / Disabled with their shapes), and **one switch**, "Share folders with Windows and Mac
  computers", whose consequence line says "Off: no folder can be opened from Windows or Mac
  computers."
- **Shared this way**: a table of the folders shared over SMB (section 4), the empty state saying
  "No folder is shared with Windows and Mac computers yet" with "Share a folder" (accent, A6) that
  opens a picker of folders.
- **Settings** as settings rows (foundation 11): "Workgroup", one line of help, the control on the
  right; one save bar for the page.
- **Connected now**: count and a link to the connections table (4.9).

#### A shared folder's page

- One page answer (status that counts the file system: "Not reachable: its file system is not
  mounted" with the Critical treatment when the file system is missing, and its next step).
- The lineage strip at the top (drive → folder → ways in → people).
- Sections: Who can open it, Windows and Mac, Linux and Unix, Copies, Delete. **One save bar for
  the page**, counting changes across sections ("Save 3 changes": "access for 2 people, Windows and
  Mac sharing"). The SMB and NFS sections are settings rows with a switch each, not forms that open.
- The Share switch is never disabled for lack of access; with nobody given access, turning it on
  sets the section's access preset and says so in the save bar summary.
- Delete: "Remove, keep the files" and "Delete with its files" as two rows with icons (unlink;
  trash with lines), the second with the warning shape and type-to-confirm.

#### Add storage and Create a RAID array

- Question 1, "Which disk?" / "Which disks?": the DriveBay with selectable slots (only usable slots
  are buttons; the others say why on hover and focus and in text below), and the same disks as a
  list under it for keyboard and screen reader use. A chosen slot lifts and takes the selection edge.
- Question 2 (RAID), "How should they be combined?": choice cards with the arrangement glyph, the
  computed space ("8.0 GiB usable of 24.0 GiB"), and "Keeps working if 1 disk fails"; the big
  Arrangement drawing beside the cards for the selected level with "Show a disk failing".
- Question 3, "What format?": Standard (EXT4) as a statement with "Other formats".
- More options: name tags, warn level.
- Summary: "Erases everything on **sdb**, **sdc** and **sdd** (3 × 8.0 GiB)." (warning shape),
  "Makes a **mirror** with **8.0 GiB** you can use.", "Keeps working if 2 disks fail.", "Ready for
  shared folders when done." Primary: **Erase and create mirror**, which opens the type-to-confirm.
- Combining disks is a choice card in question 1 ("One disk" / "Several disks combined"), not a
  paragraph with links.

#### A network interface

- The settings open in place of the facts with the facts kept as a "Now" column on the left of
  each row ("Now: 192.0.2.128/24 · After: 192.0.2.50/24"), so old and new sit side by side.
- IPv4 method as three choice cards with icons (router, pin, off). Fixed address prefilled.
- IPv6 and DNS as statement rows ("IPv6: automatic from a DHCPv6 server · Change").
- The impact at the top of the rail, at 17px with its shape icon and the network drawing; the
  primary says **Save network settings**.
- Facts have copy buttons.

### 3.12 Under the first principle

What the two walks changed in the form pattern:

- **Newcomer.** The outcome picture is the teacher: it shows what a shared folder is before the word
  is explained. The summary's last line is always a reassurance (N3): "Takes effect when you press
  Create" or "Saved changes wait in the yellow bar". Each question has at most one line of help
  visible (G0); "Which should I choose?" is the G3 disclosure. The first time a settings form is
  saved, the G2 tip appears in the save bar's place: "Saved. Your change waits in the yellow bar at
  the top until you apply it." and the band's arrival is the pending flight (7.4). A form that
  cannot be done yet (no storage) does not open empty: it says what is needed first and offers it.
- **Pro.** `Ctrl Enter` from anywhere; More options remembered open per form; every More option is a
  palette entry; with tips off the G3 disclosures collapse to `(?)` icons so sections are one line
  shorter; compact density shows the technical term first in choice cards ("EXT4 · Standard").
- **Never**: a step-by-step wizard for something that is one form; a confirmation for a choice that
  loses nothing.

---

## 4. The table pattern

### 4.1 Start from the question

Every table opens with a **summary line** that answers its question in words, counts by state worst
first, and states the filter: "4 shared folders · 1 not reachable · 3 shared with Windows and Mac".
It replaces the explanatory paragraph (which moves to a "What is a shared folder?" disclosure).

Each table names its question in this spec (4.9), and its first two columns must answer it.

### 4.2 Anatomy

```
 [Summary line: counts, worst first]                         [Add a shared folder]  <- accent (A1)
 [Search ___________] [Filter chips: All · Not reachable · Shared · Not shared]  [Columns] [Density]
 ┌──┬───────────────────────────────┬────────────┬────────────────────┬─────────────┬────────┬───┐
 │[]│ IDENTITY                      │ STATUS     │ ANSWER COLUMN      │  NUMBER  ███│ …      │ … │
 ├──┼───────────────────────────────┼────────────┼────────────────────┼─────────────┼────────┼───┤
 │  │ [icon] Photos                 │ OK         │ [W] Windows, Mac   │   1.2 TiB ██│        │ v…│
 │  │        Family pictures        │            │ 6 people           │             │        │   │
 ├──┴───────────────────────────────┴────────────┴────────────────────┴─────────────┴────────┴───┤
 │  expanded detail (technical facts, copyable) when the row's chevron is open                  │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
 Read at 10:36 · Refresh                                         1–25 of 140  [<] [>]  (only when > 1 page)
```

### 4.3 The identity column

- A 20px object icon (16px compact) in a 28px plate (section 5), then the name in `foreground`,
  medium weight, sans. **Not underlined, not blue**: the whole row is the link to the object's page,
  with a hover ground and a chevron at the row's end; the name turns `action-label` on row hover or
  focus.
- A second line in `muted-foreground`: what it is in plain words ("Family pictures", "8.0 GiB hard
  disk"). Device names, paths and IDs are in mono on the second line or in technical columns, never
  the identity.
- Role tags sit after the name, neutral, with a glyph: "You", "Administrator" (shield), "System".

### 4.4 Status first

- The status column is second, right after identity, and the default sort is **worst first**.
- Non-OK: the full pill (icon, word, wash). OK: the check icon and "OK" in `ok-label` without the
  wash, so a list of healthy things stays plain and a problem stands out. Unknown: the hollow ring and
  the word, never blank, never "Not checked" alone (the word is "Unknown", with "Not checked yet"
  as its reason in the tooltip and the expanded row).
- Rows that are not OK take the status wash on their leading 3px edge plus the pill; never colour
  alone.

### 4.5 Numbers

- Right-aligned, tabular figures, the unit in the same cell at `muted-foreground`, a non-breaking
  space before it, one decimal, binary units.
- One number per column: "Used", "Free", "Size" are separate columns in compact; in comfortable, a
  **usage cell** is a 120px bar plus "7.8 GiB free" right-aligned, with "of 7.8 GiB · 1%" on the
  second line.
- An inline bar where magnitude matters: capacity, processor, memory. The bar is blue (usage) until a
  threshold; the threshold is a tick on the track; past it the bar takes the status fill **with** the
  pill.
- Header labels of right-aligned columns are right-aligned; the sort arrow follows the label.

### 4.6 Grouping, sorting, filtering

- Each table has a **default grouping** when its rows are of different kinds (disks: System, In use,
  Empty, Removable; file systems: Mounted, Found on the disks; people: Administrators, People;
  logs: by day). A group header row says the group, its count and its worst state.
- **Default sort** is stated in the column header (`aria-sort`) and kept per table for the session.
- **Filter chips** for the two to five states people filter by, with counts; search beside them.
  The current filter is always visible; no hidden state.

### 4.7 Rows: summary, expand, actions, selection

- **Expand**: a chevron button at the row's end opens the row's detail inline: technical facts in a
  two-column fact list with copy buttons, the full command or message, the lineage. Opening a row
  never navigates; the name and row do.
- **Row actions**: an always-visible plain "More" button (24px, the three-dot glyph, named "Actions
  for Photos") opens a menu. On hover and on focus within the row, one or two common verbs appear
  as plain icon-and-word buttons before it ("Share", "Check health"). Everything in those quick
  buttons is also in the menu, so nothing is hover-only. Destructive items are last in the menu,
  after a separator, with their icon and "…".
- **Keyboard**: the table is one tab stop (a grid with roving focus): arrows move between rows,
  `Enter` opens the row's page, `Space` selects, `→` expands, `←` collapses, `.` or `Shift F10`
  opens the row's menu, `/` focuses search, `Escape` clears selection.
- **Bulk selection** (pros): a checkbox column only on tables with bulk actions. Selecting replaces
  the toolbar with the selection bar: "2 selected · Check health · Stop sharing · Clear". Bulk
  destructive actions confirm with the list of objects.

### 4.8 Density, states, narrow screens

- **Density**: comfortable rows are 52px with two lines; compact rows are 32px with one line (the
  second line goes to a tooltip and the expanded row), readouts in mono.
- **Loading**: skeleton rows of the right height, the summary line saying "Reading shared folders…".
- **Empty**: the object's 64px illustration icon, one sentence of what belongs here, one accent
  button to create it (A6), one plain link to learn more. Not centred in a 1100px void: aligned with
  the table's left edge, inside the table frame, at the table's header height plus 160px.
- **Filtered to nothing**: "No folder matches 'pho'." with "Clear search" (and the filter names
  when chips are on). Visually distinct from empty: no illustration.
- **Error**: in the table frame, the backend's message as text, "Try again"; the last good rows stay
  if there were any, marked "Shown from 10:31; reading again failed".
- **Stale**: "Read at 10:36 · Refresh" under the table, left; live tables say "Live · every 5 s ·
  Paused while you point at a row" and freeze their order under the pointer or focus.
- **Pagination** appears only when there is more than one page.
- **Narrow (table container under 640px)**: rows become a list, not a squashed table. Each item:
  line 1 icon, name, status; line 2 the answer column; line 3 the key number with its bar; the
  chevron opens the page; the More button stays. Column headers become a "Sort by" select. Bulk
  selection appears through "Select" in the toolbar. At 200% zoom on a 1280px screen the same list
  is used.
- **Long text**: one line, truncated with an ellipsis, full text in the expanded row and on hover
  (title tooltip). Paths are truncated in the middle (start and end kept) with a copy button. Every
  backend string is text (UI-2) in a `bdi` so right-to-left names keep the row's reading line.
- **Empty cells**: never "None" repeated. A dash in `tertiary-foreground` with an accessible name
  ("No email"), or a meaningful word ("Not shared").

### 4.9 The tables, redesigned

#### Shared folders

- **Question:** which folders, reachable or not, how and by whom.
- **Summary:** "4 shared folders · 1 not reachable · 3 shared with Windows and Mac".
- **Columns:** Folder (folder icon, name, description or "on Data drive") · Status (counts its file
  system: "Not reachable") · Reached by (service icons with words, "Windows and Mac", "Linux"; "Not
  shared") · Who can open it ("6 people", "Everyone", "Nobody yet"; decision 4) · Drive (the file
  system's name with a 60px free-space bar) · actions.
- **Technical columns** (switch): Full path (middle-truncated, copy), Folder on the drive, In use.
- **Sort:** status worst first, then name. **Group:** by drive when there are two or more.
- **Row quick actions:** "Share" / "Stop sharing", "Copy address". Menu: Open, Give access…, Share
  with Linux…, Keep a copy…, Remove, keep the files…, Delete with its files….
- **Bulk:** Stop sharing, Give access….
- **Empty:** "No shared folders yet. A shared folder is a folder your computers can open over the
  network." **Add a shared folder**.

#### People

- **Question:** who, with what powers, opening what.
- **Summary:** "6 people · 1 administrator · 1 may sign in over SSH".
- **Columns:** Person (initials avatar plate, name, "who they are"; tags "You", "Administrator") ·
  Groups (chips, two then "+1") · Can open ("Photos, Music +2"; decision 4) · Signs in over SSH (the
  terminal glyph and "Yes" only when yes; otherwise a dash) · actions. Email is a technical column.
- **Group:** Administrators, People. **Sort:** name.
- **Quick actions:** "Change password". Menu: Open, Add to group…, Give access to a folder…, Delete….
- **Bulk:** Add to group…, Give access…, Delete….
- The "Who can control this NAS" card goes; the Administrators group header says it.

#### Disks

- **Question:** which disk is which, healthy or not, holding what.
- **Above the table:** the DriveBay. Pointing at or focusing a slot highlights its row; selecting a
  row rings its slot (the bay's `arrived`).
- **Summary:** "6 disks · health not checked since you signed in · Check health" (accent when
  unchecked and nothing worse is on the page, A2).
- **Columns:** Disk (kind icon: hard disk, SSD, NVMe, USB, optical, unknown; "8.0 GiB hard disk";
  model on line 2; device as a mono chip) · Health (status word and shape; Unknown "Not checked yet"
  as its reason) · Temperature (right, °C, with a threshold pill only when crossed) · Holds ("Data
  drive (EXT4)", "System", "Empty" with "Add storage" as an inline plain action) · Power ("Awake",
  "Asleep" with moon glyph) · actions.
- **Technical columns:** Serial, Device path, Model.
- **Group:** System disk · In use · Empty, ready to use · Removable and optical. **Sort:** health
  worst first, then device within each group.
- **Quick actions:** "Check health". Menu: Open, Add storage… (empty only), Wipe… (last, apart).
- **Bulk:** Check health.

#### File systems

- **Question:** how full is each, and is it working.
- **Summary:** "2 file systems · fullest 10% · 1 found on a disk, not mounted".
- **Columns:** File system (icon, name or "EXT4 on sda1", the kind tag) · Status · Space (usage cell,
  4.5, with the warn tick) · Shared folders (count, "3 folders" linked to the filtered folders
  table; "None" when none, honestly, since this is the answer for "can I remove it?") · On (disk
  icons with device) · actions.
- **Group:** Mounted · Found on the disks, not mounted (same table, same columns, "Mount…" as its
  quick action, status Unknown "Not mounted").
- **Sort:** status, then fullest first.
- Toolbar: "Add storage" (accent); "Combine disks" goes into Add storage's question 1; "Refresh"
  becomes the "Read at" line.

#### Processes

- **Question:** what is using the processor or memory now.
- **Summary card** stays (it is the answer), tightened to one row of four readouts with bars.
- **Columns:** Program (name, e.g. `python3`; line 2 the person running it) · Processor (bar +
  percent, right) · Memory (bar + size, right) · State (words; Stopped and "Finished, not cleared
  away" with their glyphs; Sleeping and Idle in `muted-foreground`) · ID (technical).
- **Filter chips:** "Programs" (default: hides kernel threads, recognised as processes with no
  command line), "All", "Stopped or finished".
- **Expand:** the full command, wrapped, mono, copyable.
- **Sort:** processor, highest first; the order freezes while the pointer or focus is in the table,
  and the summary says so.
- **Rows:** the first 20, then "Show all 176".

#### System logs

- **Question:** what happened, when, anything wrong.
- Opens on **All system messages** (the last log chosen is remembered for the session).
- **Columns:** Time (`14:29:37`, mono, tabular, right-aligned) · From (the program, taken from the
  text before the first colon, when there is one; text only) · Message (one line, truncated;
  expand for the full text with copy).
- **Group:** by day ("Today", "Yesterday", "Thursday 19 November").
- **Filter chips:** the five most frequent sources, and "Lines with 'error' or 'fail'" (named for
  what it does; the logs carry no level).
- **Follow newest** switch for a live reading; scroll up stops following (style guide 5.7).
- Right-to-left messages are isolated (`bdi`, `dir="auto"`) inside a start-aligned cell.

#### Services status and connections

- **Question:** who is connected now, and to what.
- Per service, a table built from the service's text output (decision 5): Computer (address, mono) ·
  Person · Shared folder · Connected since · Files open (count; expand lists them). The raw output is
  one disclosure away ("What the NAS said", the terminal pair) and is shown instead, with a note,
  when the output cannot be read as a table.
- The services list (Diagnostics > Services) becomes a table: Service (icon, plain name, protocol as
  tag) · Status (Running, Stopped, Disabled) · Starts with the NAS · Used by (folder count) ·
  Connected now (count where known).

### 4.10 Under the first principle

- **Newcomer.** The summary line answers the table's question before the table is read. Empty
  tables teach by showing (7.3): a ghost row in dashed outline of what will appear ("Photos ·
  Windows and Mac · 6 people", labelled "Example"), one sentence, one accent action. The identity
  column is a picture and a plain name, so no row needs a device path to be understood. Rows look
  pressable at rest (chevron, hover ground), so no tip says "click a row".
- **Pro.** One tab stop and arrow keys; compact rows with the technical identity on line one;
  technical columns remembered; bulk selection; the palette can filter a table ("Disks not checked").
  With tips off, ghost rows and the "What is a shared folder?" disclosure go; the summary stays.

---

## 5. Icons and diagrams

### 5.1 What exists

- **lucide**: about 50 interface glyphs in use (TriangleAlert 21 times, CircleAlert 11, chevrons,
  check, copy, eye, external link, pause, play). Keep lucide for interface glyphs; it has no
  coherent NAS vocabulary.
- **Drawings in the library**: DriveBay (caddies by kind: hdd, ssd, usb, disk), Arrangement (blocks
  for mirror, stripe, parity, with a failing disk), ConnectionMap (columns of nodes with traced
  lines; labels truncate at 1280: "Windows and M…", "Family docu…"), DeletePicture, CopyDirection,
  EmptyPendingPicture, ConnectionLine. They follow foundation 9 (4px grid, 1.5px strokes, round
  joins, `currentColor` ink, `--art-*` fills, no `<style>` in SVG).
- **Missing**: every domain object icon, every action icon, and drawings for sharing exposure, NFS
  reach, wipe, add storage, network change and person access.

### 5.2 The style of the custom set

One set, drawn to sit beside lucide without looking borrowed.

| Property | Rule |
| --- | --- |
| Grid | 24 by 24, 2px padding (20px live area); key shapes: rectangle 18×14, square 16×16, circle 18 |
| Stroke | 1.75px at 24px, round caps and joins, `vector-effect: non-scaling-stroke` so 16px and 20px stay crisp; lucide stays at 2 (the difference reads as "object" versus "control") |
| Corners | 2px on small parts, 3px on bodies, matching the drawings' 3 and 6 at double scale |
| Two tones | Outline in `currentColor`; one inner plane filled with `--art-plane` (a tinted surface step of the base blue, 14% light, 18% dark). No third tone |
| The accent in icons | Only A5: the action mark (plus, arrow, link) of an action icon on an accent button, in `accent-foreground` |
| Status on an object icon | A 9px badge at the bottom right, cut out of the icon with a 1.5px gap: the status's own shape (check disc, triangle, octagon, hollow ring) in its stroke colour. Shown only when not OK, and always with the word elsewhere in the row |
| Pending on an object | The pending glyph badge, `pending-stroke`, same place |
| Sizes | 16 (inline, compact rows), 20 (rows, navigation, menus), 24 (headings, choice cards), 32 plate (page and form titles: the icon on a 32px `muted` squircle), 64 and 96 illustration (empty states, outcome pictures; same strokes at 1.5px, up to 3 planes, may combine objects) |
| Implementation | React components from data (UI-2): `<Icon name="disk-hdd" size={20} badge="warning" />`, paths in code, no SVG strings parsed, no external sprite (UI-7), classes for fills, no inline style attributes (UI-1) |
| Names | Every icon has a plain name in the catalogue for its tooltip and accessible name when it stands alone; beside a word it is `aria-hidden` |

### 5.3 Inventory: domain objects

| Object | Icon | Notes |
| --- | --- | --- |
| Hard disk | 3.5" body with a platter arc and the connector edge | Matches DriveBay `hdd` |
| SSD | 2.5" body, flat, chip rows | DriveBay `ssd` |
| NVMe | M.2 stick with the notch | New caddy face for DriveBay too |
| USB disk | Stick with plug | DriveBay `usb` |
| Optical | Disc with tray | |
| Unknown disk | Plain body with a hollow ring badge slot | Never guess the kind |
| System disk | Disk with a small gear plane | Tag "System" too |
| File system | Disk body with a folder tab on top | The type (EXT4, XFS, BTRFS) is a tag, never an icon |
| RAID array | Three disks overlapped with a bracket | |
| RAID levels (glyphs, 20 and 24) | Mirror: two columns with the same block; Stripe: two columns, blocks alternate; Parity: three columns with a P block; Double parity: four with two P; Mirror and stripe: two mirrored pairs | Same block shapes as Arrangement, so the card glyph and the big drawing agree |
| ZFS pool | Disks standing in a basin | |
| ZFS file system (dataset) | Folder inside the basin outline | |
| Snapshot | Folder with a shutter corner | |
| Shared folder | Folder with an outward ribbon | The most-used icon; it sets the set's character |
| Home folder | Folder with a house roofline | |
| Person | Head and shoulders | Initials avatar is used in tables; this icon in menus and empty states |
| Administrator | Person with a shield plane | |
| Group | Two people, one in front | |
| Windows and Mac sharing (SMB) | A desktop screen and a laptop side by side | No vendor logos (trademarks, UI-7) |
| Linux and Unix sharing (NFS) | A tower computer and a media box | |
| Rsync server | Two folders with a loop arrow | |
| SSH | Terminal window with a key | |
| Copy job | Folder, arrow, folder | Matches CopyDirection |
| Scheduled | Clock plane in the corner of an object | A badge-like plate, not a status |
| Network port (Ethernet) | RJ45 socket | |
| Wi-Fi | Fan of three arcs from a dot | |
| Bond | Two cables merging into one | |
| VLAN | Cable with a tag | |
| Bridge | Two ports joined by an arch | |
| Firewall | Wall of bricks with a gap | |
| This browser | Window with a cursor | For network drawings |
| The NAS | A small box front with drive slots | The product's own picture; also the dashboard's map anchor |
| Certificate (HTTPS) | Seal on a page with a lock | |
| Updates | Box with an up arrow | |
| Email alerts | Envelope with a small bell | |
| Temperature | Thermometer | |
| Power, restart | Power glyph; loop arrow with a power dot | |

### 5.4 Inventory: actions

Each action is its object with an action mark, so the icon says both what and to what. The mark sits
bottom right, 10px, drawn on a cut-out.

| Action | Icon |
| --- | --- |
| Create / add | Object + plus |
| Share | Shared-folder ribbon arrow out of the object |
| Stop sharing | Ribbon with a stroke through |
| Give access | Key into the object |
| Mount | Disk with an arrow into a socket |
| Unmount | Arrow out of the socket |
| Mirror (make a mirror) | Two disks with an equals mark |
| Wipe | Disk with a sweep (three diagonal strokes) |
| Format | Disk with a grid plane |
| Check health | Disk with a pulse line |
| Blink light | Port with three short rays |
| Apply | Check into a bar (the gold band's shape; the icon is ink, never gold) |
| Undo | Counter-clockwise arrow into a bar |
| Delete (with data) | Trash with lines |
| Remove (keep data) | Broken link (unlink) |
| Copy now | Two folders with a play mark |
| Grow | Disk with outward arrows |
| Replace disk | Two disks with a swap arrow |
| Scrub / check file system | File-system icon with a magnifier |

### 5.5 Diagrams: which flows get one

A flow gets a diagram when its consequence cannot be seen any other way. All use the map's language
and are React components from data.

| Diagram | Where | Answers |
| --- | --- | --- |
| **Lineage strip** (new; a one-row ConnectionMap) | Add shared folder, a folder's page, sharing settings, delete share | "What this shares, with whom, over what" |
| **NFS reach** (new) | NFS on a folder | "Which computers can mount it": one computer (1 screen), a network (a row of screens inside a bracket with the range), any computer (screens fading out past the bracket) |
| **Guest access** (new) | SMB More options when guest is on | Door with a key versus open door, with "Anyone on your network" |
| **Arrangement** (exists) | RAID and ZFS create, a pool's page | "What a RAID level survives", with the real disks and space |
| **Erase picture** (new, from DeletePicture) | Add storage, RAID, Wipe | "What is lost": the disk with its partitions, file systems and folders, struck through |
| **Delete picture** (exists) | Delete share, delete file system, delete person | "What deleting removes and what depends on it" |
| **Network change** (new) | Interface settings, bond, VLAN | "Will I lose this page": browser → interface → NAS, old address to new, the line cut when the page will lose the NAS |
| **Person access** (new; a lineage strip) | Add person, a person's page | "What can alex open": person → groups → folders with levels |
| **Copy direction** (exists) | Copy jobs | "Which way does it copy" |
| **Pending loop** (EmptyPendingPicture, extended) | The first save of a session, the pending band's help | "Save → yellow bar → Apply → services restart" |
| **The NAS map** (ConnectionMap, extended into lanes) | The dashboard | "How it all fits, and where is the problem" |

### 5.6 Under the first principle

Icons are how a newcomer recognises a thing before reading its name, so every object has the same
icon in the navigation, the map, tables, forms and dialogs, and the same name next to it. An icon is
never alone where a newcomer must decide (always with its word); a pro can rely on icons alone in
compact density, where each still has its name as tooltip and accessible name. Diagrams answer the
newcomer's "what will happen?" before they act (5.5); for a pro they are the fastest dependency
check, and they are never in front of a control.

---

## 6. The dashboard

### 6.1 First principles

**Why the owner opens it**, most to least frequent:

1. "Is everything fine?" A glance, under 2 seconds, from a phone too.
2. "Something is wrong" (an email, a slow copy, a folder that will not open): what, where, what to
   do.
3. "Is it busy right now?" Processor, memory, network, who is connected.
4. "How full is it?" Space left per drive.
5. To go and do something: add a folder, a person, check disks.

**What a pro scans**, in order: problems, disk health and temperatures, space, services running,
addresses, load, uptime and updates, pending changes, running tasks.

So the page reads top to bottom as: **the answer → what needs you → the NAS itself, with status in
place → what is happening now → setup and facts**.

**What makes it look designed by a person, not generated:**

- One picture is the page's centre, not a grid of same-shaped cards.
- Regions have different shapes because they hold different things: a sentence, a short list of
  rows, a wide diagram, a strip of readouts, a two-part footer.
- Status is shown where the thing is, not summarised in a ring.
- No centred headline, no ring, no pills on healthy things, no "Open X" card footers, no gradients
  beyond the ambient light, no symmetric three-up row.

### 6.2 The regions

| Region | Contents | Shape |
| --- | --- | --- |
| **A. The answer** | One sentence at 28px semibold, left-aligned ("1 thing needs you" / "All OK"), its reason at 15px, and area chips: Disks, Storage, Shared folders, Sharing, Network, System, each the area's icon, name and state word (OK chips are plain: icon and word only; non-OK take the pill). Each chip moves focus to its lane in C. Right side: when nothing needs the person, the next first step's button or nothing | Full width, about 96px |
| **B. Needs you** | Only when something does. A list of rows (not cards): status icon, title, one line, the next step button on the right (A2: the worst row's button filled accent, the others outlined). At most 3 rows, then "2 more" | Full width, 56px a row |
| **C. Your NAS** | The map in five lanes, left to right: Disks (the bay as slot tiles, health in place) → Storage (file systems and arrays with usage bars) → Shared folders (with how each is reached) → Ways in (SMB, NFS, rsync, SSH tiles: on/off, running, connections) → Network (interfaces: link, address, live in/out). Lines show what feeds what; a problem lights its lineage. **Each lane ends in its action** on a shared baseline ("Check health", "Add storage", "Add a shared folder", "Sharing settings", "Interfaces") so lanes of different heights end together | Full width, height of the tallest lane, capped |
| **D. Right now** | A strip of live readouts of different widths: Processor (percent + sparkline), Memory (percent + used of total + sparkline), Network (in and out + two-series sparkline, wider), Activity (tasks running, connected computers when known). "Live · every 2 s · last 58 s" | Full width, 88px |
| **E. Footer** | Left, 8 of 12: First steps as a horizontal stepper (4 numbered steps in a row, the current one's button accent, A4); when hidden or done, **Shortcuts** in the same slot (icon buttons: Add a shared folder, Add a person, Check disk health, Open the classic interface). Right, 4 of 12: This NAS (name, version, uptime, time, updates) as a two-column fact list | Two blocks of equal height by design (both about 160px) |

Every region spans the full content width or splits it in a fixed 8/4, so **no region can leave a
hole beside it**: there is never a column whose height depends on another column's content.

### 6.3 Wireframes

Legend: `[ok]` check, `[!]` warning triangle, `[x]` critical octagon, `[o]` hollow ring (Unknown),
`[D]` disk icon, `[F]` folder icon, `[W]` Windows and Mac, `[L]` Linux, `[R]` rsync, `[S]` SSH,
`[N]` network port, `###` accent button, `===` usage bar, `~~~` sparkline, `|` `-` lane lines.

#### 1440, comfortable, something needs you (content 1096px beside a 264px sidebar)

```
+------------------------------------------------------------------------------------------------+
| A  1 thing needs you                                                                           |
|    The NAS needs a restart to finish installing updates.                                       |
|    [o Disks Not checked] [ok Storage] [ok Shared folders] [ok Sharing] [ok Network] [! System] |
+------------------------------------------------------------------------------------------------+
| B  [!] The NAS needs a restart     Updates finish installing when it restarts. [### Restart ↗]|
|    [o] Clocks differ by 4 days     Schedules and logs will be wrong.           [ Check time ↗ ]|
+------------------------------------------------------------------------------------------------+
| C  Your NAS                                                                     nas · 6 disks  |
|  DISKS            STORAGE              SHARED FOLDERS        WAYS IN            NETWORK        |
|  +--+ +--+ +--+   System drive         [F] Photos        -- [W] Windows+Mac   [N] enp2s0       |
|  |o | |o | |o |-- ===------ 10%        Windows and Mac   /    On · Running    1 Gbit/s         |
|  +--+ +--+ +--+   16.9 GiB free     /  [F] Music        /     2 connected     192.0.2.10       |
|  nvme sda  sdb   Data drive        /   Windows and Mac       [L] Linux Off     in 0.0 out 0.0   |
|  +--+ +--+ +--+-- =--------- 1%  --    [F] a4share           [R] Rsync Off     KiB/s            |
|  |o | |o | |  |   7.8 GiB free         Not shared            [S] SSH On                         |
|  +--+ +--+ +--+                                                                                 |
|  sdc sdd  sr0                                                                                   |
|  Not checked                                                                                    |
|  ----------------------------------------------------------------------------------------------|
|  Check disk health  Add storage        Add a shared folder   Sharing settings   Interfaces     |
+------------------------------------------------------------------------------------------------+
| D  Processor 1 %  ~~~~~~   | Memory 9 %  338.5 MiB of 3.8 GiB ~~~~ | Network in 0.0 out 0.0 KiB/s ~~~~~~~~ | No tasks running |
|    Live · every 2 s · last 58 s                                                                |
+------------------------------------------------------------------------------------------------+
| E  First steps  1 of 4 done                                 | This NAS                         |
|  (1)ok Name   (2) Password    (3) HTTPS       (4) Alerts    | Name nas       Version 8.6.1-1   |
|               [### Change]   [ Turn on ↗ ]   [ Set up ↗ ]   | Up 5 h 25 min  Updates 33 ↗      |
|               The factory password may still work.          | Time Thu 19 Nov 11:50            |
+------------------------------------------------------------------------------------------------+
```

The accent appears once filled (Restart, B's worst row). E's "Change" is the first-steps current
step; under the one-filled rule it is outlined in `accent-stroke` while B shows a filled accent, and
takes the fill when B is empty.

Lane widths at 1096px: Disks 220, Storage 220, Shared folders 240, Ways in 200, Network 176 (lines
take the gutters between lanes). Shared folders gets the most because names are the longest; no
label truncates at this width with the mock's data; longer names truncate with the full name in the
node's tooltip and accessible name.

#### 1440, comfortable, all OK

A says "All OK" and "Disks checked at 10:31. 2 of 2 file systems have space."; the chips are icons
and words without washes; B is absent (no gap is left: C starts 24px under A). The filled accent is
on E's current first step, or on nothing when first steps are done (Shortcuts are plain links).

#### 1440, compact

```
+------------------------------------------------------------------------------------------------+
| A  All OK  · disks checked 10:31   [ok Disks][ok Storage][ok Folders][ok Sharing][ok Net][ok Sys]|
|    CPU 1 % ~~~  MEM 9 % ~~~  NET ↓0.0 ↑0.0 KiB/s ~~~  TASKS 0           (D folds into A's line) |
+------------------------------------------------------------------------------------------------+
| C  DISKS          STORAGE             SHARED FOLDERS     WAYS IN         NETWORK               |
|    [▮▮▮▮▮▮] 6 ok   System  10% ===     Photos  W          W On 2 conn    enp2s0 1G 192.0.2.10 |
|    nvme 30 °C      Data     1% =       Music   W          L Off          ↓0.0 ↑0.0             |
|                                        a4share  -         R Off  S On                          |
|    Check health    Add storage         Add folder         Settings       Interfaces            |
+------------------------------------------------------------------------------------------------+
| E  First steps 1/4: (2) Change the factory password [###]  (3) HTTPS  (4) Alerts | nas · 8.6.1-1 · up 5 h · 33 updates |
+------------------------------------------------------------------------------------------------+
```

In compact, D's readouts join A's band (mono readouts, 20px sparklines), B's rows are 36px, C's
nodes are one line each (name and the key figure) and the bay slots are 24px ticks, E is one line.
The whole dashboard fits in 900px of height with 6 disks, 2 file systems, 3 folders.

#### 900, comfortable (drawer navigation; content about 836px)

```
+----------------------------------------------------------------------------+
| A  1 thing needs you                                                       |
|    The NAS needs a restart to finish installing updates.                   |
|    [o Disks][ok Storage][ok Shared folders]                                |
|    [ok Sharing][ok Network][! System]                                      |
+----------------------------------------------------------------------------+
| B  [!] The NAS needs a restart                          [### Restart ↗]   |
|        Updates finish installing when it restarts.                         |
+----------------------------------------------------------------------------+
| C  DISKS              STORAGE                 SHARED FOLDERS              |
|    +--+ +--+ +--+  -- System drive  10% ===  -- [F] Photos   W           |
|    +--+ +--+ +--+     Data drive     1% =   --- [F] Music    W           |
|    Not checked                                  [F] a4share  Not shared   |
|    Check disk health  Add storage               Add a shared folder        |
|  ------------------------------------------------------------------------ |
|    WAYS IN  [W] Windows and Mac On · 2 [L] Linux Off [R] Rsync Off [S] SSH On |
+----------------------------------------------------------------------------+
| D  Processor 1 % ~~~   | Memory 9 % ~~~                                    |
|    Network ↓0.0 ↑0.0 KiB/s ~~~~~~  enp2s0 · 192.0.2.10 | No tasks running  |
+----------------------------------------------------------------------------+
| E  First steps 1 of 4 (four steps as a 2 by 2 grid of equal cells)         |
|    This NAS (fact list, two columns, full width)                           |
+----------------------------------------------------------------------------+
```

Three lanes keep the lines (disks → storage → folders); Ways in becomes a row of tiles under the
map, each folder showing its ways in as icons; Network joins D (its address under the network
readout). D is a 2 by 2 grid.

#### 900, compact

As 900 comfortable with D folded into A as one readout line, B rows at 36px, C nodes single-line,
E's steps in one row of four.

#### 390, comfortable (content 358px, 16px gutters)

```
+----------------------------------+
| A  1 thing needs you             |
|    The NAS needs a restart.      |
+----------------------------------+
| B  [!] The NAS needs a restart   |
|    Updates finish installing     |
|    when it restarts.             |
|    [###### Restart ↗ ###########]|
|    [o] Clocks differ by 4 days > |
+----------------------------------+
| C  Your NAS                      |
|  > [D] Disks  6 · Not checked    |
|    ▯▯▯▯▯▯ (slots, wrap at 6)     |
|    Check disk health             |
|  > [D] Storage  2 · OK           |
|    System drive 10% ===          |
|    Data drive    1% =            |
|    → feeds 3 shared folders      |
|  > [F] Shared folders  3 · OK    |
|  > [W] Sharing  2 on · OK        |
|  > [N] Network  enp2s0 · OK      |
+----------------------------------+
| D  CPU 1 % ~~~  MEM 9 % ~~~      |
|    NET ↓0.0 ↑0.0 KiB/s ~~~       |
+----------------------------------+
| E  First steps 1 of 4            |
|    (2) Change the password  [>]  |
|    This NAS (facts, one column)  |
+----------------------------------+
```

A's chips are replaced by C's lane headers (which carry the same states), so the state is not said
twice. Each lane is a disclosure row; the two with a problem or the most useful content (Disks,
Storage) open by default; the lines are dropped and each lane says in words what it feeds
(foundation 9).

#### 390, compact

Lanes closed by default except one with a problem; D is one line; B rows keep their full-width
button (44px target on touch).

### 6.4 Many disks, many file systems, many folders

- **Lanes are capped**: Disks shows up to 12 slots at full size (3 across × 4 rows at 1440); beyond
  12, healthy slots collapse into a bay strip of 12px ticks with their shape ("20 more, all OK"),
  and every non-OK disk keeps a full slot. 24 disks fit in the same height as 12.
- **Storage** shows up to 5 nodes: every non-OK one, then the fullest; then "+3 more, all OK". RAID
  arrays and ZFS pools are storage nodes with their disks' lines.
- **Shared folders** shows up to 6: non-OK first, then recently changed (by the order the backend
  returns, not invented history), then "+N more".
- **Ways in** shows only services that are on, plus one "Off: NFS, rsync" line.
- **Network** shows up to 3 interfaces; virtual ones (VLAN, bond members) fold under their parent.
- C's height is capped at the height of 12 disk slots (about 420px comfortable, 220px compact). The
  "+N" nodes link to the full page, filtered.
- With **no shared folders**, the lane holds its empty state ("No shared folders yet") with "Add a
  shared folder" as the lane's action, filled accent when nothing else needs the person.
- With **no data disks**, Storage and Shared folders lanes show their empty state and the first step
  ("Add storage") becomes the accent.

### 6.5 States

- **Loading**: A shows "Reading the NAS…"; C draws the lanes' skeleton (slot outlines, bar tracks)
  at their final size; D says "Starting live readings" with empty tracks.
- **A lane fails to read**: the lane shows its error in place ("Could not read disks" and the
  backend's message, "Try again"); A counts it as Unknown for that area ("Disks: could not read");
  the other lanes stand.
- **Normal user** (not an administrator): A answers for what they can see, C shows only the shared
  folders they can open and the ways in, E is their account (change password).
- **Pending changes**: the band under the top bar as today; nodes whose configuration is pending
  carry the pending badge (5.2) in C.
- **Task running**: D's activity readout shows it with progress and "Show"; A does not change.

### 6.6 What moves where from the current dashboard

| Today | New place |
| --- | --- |
| Hero headline + ring + legend | A (sentence and chips) |
| Needs attention cards | B (rows) |
| Storage card with rings | C, Storage lane (bars) |
| Disks card with bay | C, Disks lane |
| Right now (three tall charts) | D (one strip) |
| First steps (1100px card) | E left (horizontal stepper) |
| Services card | C, Ways in lane |
| Network card | C, Network lane, and D |
| System card | E right |

Every fact on today's dashboard keeps a place (the earlier dashboard spec's 10.3 list holds).

### 6.7 Under the first principle

- **New NAS** (P.2): A welcomes; the map shows found disks and ghost nodes with lane captions ("A
  shared folder is what your computers open"); E's first steps move up between A and C until two
  steps are done, with "Add storage" as the accent. When a step is done its ghost becomes real in the
  map (7.6), which is the reward and the explanation at once.
- **New interface on an existing NAS**: the one-line welcome above A (P.2) and the G2 tip "Point at
  a box on the map to see what it feeds" under the map's title, until the first trace.
- **Pro**: compact density (6.3) puts the live readouts in A's band and fits the page in one screen;
  jump keys `g d` (dashboard), `g s` (storage) and the area chips as keyboard targets (`1` to `6`
  move focus to a lane when focus is on the page, ignored while typing); with tips off, captions,
  ghosts and the welcome never show and first steps are Shortcuts.

---

### 6.8 The map, revised: storage rows, not lines (owner, 2026-11-25)

The owner on the v4 map: "the map is heading in an interesting direction but just make sure you get
the UX right, it is very hard to follow the connecting lines at the moment."

**Why the lines failed** (v4 shots): five columns of different lengths joined by thin curves.
Storage to folders fans six curves out of one trunk; folders to ways in fan nine curves into three
tiles; ways in to network converge three into one. Curves cross, run in parallel 2px apart and
leave the eye nowhere to start. Hovering a node dimmed the others but dropped the lines, so tracing
showed less, not more. The right two lanes were short, so the map's right half was mostly empty.

**The fix: let position do the connecting.** What hangs together sits on one row. A line is only
ever drawn between neighbours on the same row, straight, short, and never crossing another.

1. **One row per storage.** Left to right on the row: its disks (bay slots, small) → a short straight
   connector → the storage (name, technical term in secondary text, usage bar, free space, state) → a short
   straight connector → its shared folders as a wrapping group of folder chips. Each folder chip
   carries the icons of the ways it is reached by (Windows and Mac, Linux, rsync) and its state;
   "Not shared" in tertiary text when none. A storage with no folders says "No shared folders" and,
   for the system drive, "Holds the system".
2. **Problems flow right along their row.** A disk's Warning colours its connector and marks the
   storage and every folder on that row "At risk" (warning tone, icon and word); a full storage
   marks its folders. The row's left edge carries a 3px tone bar so the problem row is found from
   across the room. Nothing on other rows changes, so there is nothing to follow.
3. **Unused disks** get their own row at the bottom: "Not in use: sdf, sdg" → a dashed connector →
   a dashed ghost storage reading "Add storage" (the lane's action, accent when it is the first
   step). A newcomer sees exactly where a new disk goes.
4. **Ways in and network become one band under the rows**, a small left-to-right diagram with a
   single fan-in that is easy to read: the ways in that are on, as tiles (name, technical term,
   running, computers connected) → one connector each into the network tile (interface, speed,
   address, live in/out) → "Your network". Off ways are one line in secondary text ("Off: Copies to other NAS").
   With more than one interface, the band shows each, and each way's connector goes to the
   interface it listens on (all, in practice: then one bracket, not N lines).
5. **Tracing is highlighting, not lines.** Pointing at or focusing a folder chip lights its row and
   the ways-in tiles it is reached by (and their connector to the network). Pointing at a way-in
   tile lights every folder chip reached by it, wherever it is, and dims the rest. Pointing at a
   disk lights its row. Keyboard focus does the same. The lit state is an outline in `selected`
   plus the others at reduced emphasis, never below 3:1 for text.
6. **Column alignment across rows.** Disks, storage and folders start at the same x on every row
   (a grid with three tracks: disks auto up to 3 slots wide, storage a fixed ~240px, folders 1fr),
   so the column headers (DISKS, STORAGE, SHARED FOLDERS) still read and the eye scans down a column
   as easily as along a row.
7. **Row order**: rows with a problem first (worst first), then by size of what the row holds, the
   system drive last (it rarely matters to the person), unused disks at the very end.
8. **Actions**: the map's actions sit in one footer row under the band, in reading order: Check
   disk health, Add storage, Add a shared folder, Sharing settings, Interfaces. The footer is one
   line at every width (wraps at 390).
9. **Many**: a row with more than 6 disks shows a bay strip (12px ticks) with problem disks at full
   size; more than 6 folders on a row shows 5 and "+N more" (links to the folders page, filtered
   to that storage). More than 6 storage rows: problem rows, then the fullest, then "+N more, all
   OK" as a final row.
10. **A disk in two storages** (partitions): it appears on each row, with "also in System drive" in
   its tooltip and a small link mark; no line between rows.
11. **Narrow**: at 900 the row keeps disks and storage side by side and the folders wrap under the
   storage, still inside the row's box. At 390 each row is a card: disks across the top, the storage,
   then folder chips, with the connectors vertical. The band stacks: ways in as a list, then the
   network. No disclosures needed; rows are short.
12. **New NAS**: one real row "Not in use: sda, sdb" → ghost "Add storage" (accent), and one ghost
   example row under it (EXAMPLE tag: disk → "Data drive" → "Photos [Windows and Mac]") with the
   one-line captions under the column headers (what a disk, storage and a shared folder are). The
   band shows the ways in as Off with the caption "How computers reach your shared folders".
13. **Screen readers**: each row is a list item named "Data drive, on disk sda: 92 percent used,
   almost full. Shared folders: Photos, Music, Documents, at risk." The band is a list of ways in,
   each "Windows and Mac (SMB): on, 2 computers connected, over enp2s0".

**The first visit (owner Q2):** the NAS assembles row by row, top to bottom: each row's disks slide
into their slots, its connector draws, the bar fills, the folder chips rise; then the band's tiles
settle and their connectors draw into the network. About 900ms, every part usable as it lands.
Remembered per browser (`omv-webui.seen.dashboard-welcome`, a non-sensitive preference, UI-13).
**It can be seen again**: "Show me around" in the dashboard's footer (beside This NAS) and in the
account menu replays the assembly and brings back the welcome line and the newcomer captions for
that visit. In reduced motion it replays as a fade plus the captions.

**Compact density (owner Q3):** hides the one-line explanations under each first step (title and
button only), the lane captions and the welcome's second sentence. Comfortable shows them.


## 7. Motion

The owner, 2026-11-25: **"make use of clever and fun animations that are subtle and not annoying."**
This section adds to foundation 7 (its tokens, curves and catalogue stand; the motions already in
its catalogue are referred to by name, not redesigned). Every motion below is tagged:

- **Teach**: it shows a newcomer cause and effect (what this action did, where a thing went, what
  depends on what). These are the reason motion exists here.
- **Delight**: it makes a small moment feel finished. Allowed only where it is short, rare and
  carries no meaning that is lost without it.
- **Both**.

### 7.1 Rules

1. **Once per cause.** A motion runs because something happened (the person acted, a value changed,
   a thing arrived). It never loops; the only loops are the live indicator (the live line and its
   dot, while sampling), the spinner and the skeleton, while work is really happening, and the blink
   icon while the hardware light is really blinking.
2. **Short.** Feedback `duration-press` (90ms) or `duration-fast` (160ms); state changes
   `duration-base` (240ms); arrivals and drawings `duration-slow` (360ms); value glides and fills
   `duration-glide` (640ms). One motion over 360ms per action at most. Staggers use `motion-stagger`
   (45ms) and stop at 10 items; the rest appear together.
3. **Never in the way.** Input is never delayed: the pressed state answers in 90ms whatever else is
   moving; everything is interactive while it animates; a second action interrupts the first, which
   jumps to its end state. Nothing a reader is reading moves (a row being read does not slide; live
   tables freeze their order under the pointer or focus, 4.8).
4. **First-time flourishes fade to plain.** The assembling motions (the map drawing itself, an
   empty state's picture assembling, the first-steps celebration, the first pending flight's tip)
   run in full the first time in this browser (a G2 flag, P.3). Afterwards they are a 160ms fade.
   Motions that report a new cause (a status changed, a step finished, a save landed) run every time,
   because each time is news.
5. **Reduced motion keeps the meaning.** Under `prefers-reduced-motion: reduce`, or "Animations:
   Reduced" in the account menu (decision 8; it sets the same reduced tokens on `<html>` as the
   query, foundation 7.3), each motion becomes the reduced form named in its row: a crossfade at
   `duration-fast` where something changed place or shape (fade is not vestibular motion), or an
   instant change. The end state always says the same thing in words.
6. **Motion follows colour rules.** No motion adds a colour: a status wash pulses only in the
   status's own wash, the accent never pulses, nothing flashes green for "success" (OK green is the
   state of a monitored thing, style guide 2.1). The foundation's "Save settle" turns the button OK
   green for 1.5s; this spec proposes the drawn check and "Saved" in the button's own colours
   instead (decision 9).
7. **Built with what the foundation allows**: CSS transitions and keyframes on the tokens, the Web
   Animations API for drawn paths (`pathLength="1"` with `stroke-dashoffset`) and for reordering
   (FLIP), View Transitions for shared elements where supported (a cut elsewhere). No animation
   library; no inline style attributes (UI-1): custom properties through the CSSOM, as the lab does.

### 7.2 Welcome and first visit

| Motion | Cause | What moves | Timing | Tag | Repeats | Reduced |
| --- | --- | --- | --- | --- | --- | --- |
| **The NAS assembles** | First dashboard visit in this browser | The map draws lane by lane, left to right: disk caddies slide 12px into their bay slots (stagger), the lines from disks to storage draw along their length, usage bars fill from zero, folder nodes rise, service tiles settle. About 900ms in all, every part usable as soon as it lands | slots `slow` + `ease-settle`, stagger 45ms; lines `slow` `ease-standard`; bars `glide` | Teach (what feeds what, in reading order) | Once per browser; later visits fade in | Map fades in whole |
| **The welcome line leaves** | "Got it", or any action | The one-line welcome (P.2) folds up (`animate-leave`) and A moves up to close the gap | `base`, `ease-exit` | Teach (it is gone, nothing was lost) | Once | Instant |
| **A ghost becomes real** | The first storage, folder or person is created | On return to the dashboard, the dashed ghost node in its lane fills in: dashes join into a solid outline (dashoffset), the name types in as a crossfade, the line to it draws | `slow` | Both (the reward and the explanation) | Each time a ghost becomes real (at most once per lane) | Crossfade ghost to node |
| **A first step lands** | A first step is done | Its number disc turns into a check that draws its stroke, the disc settles; the next step's button fills with the accent from the left; the progress bar glides | check `base`; fill `base`; bar `glide` | Teach (progress, what is next) | Every step (each is news) | Check and fill appear |
| **Set up** | The last first step is done | The four checks slide together into one, which reads "Set up", and the stepper folds into Shortcuts | `slow`, `ease-settle` | Delight | Once ever per NAS (G1: from the steps' state) | Swap with a fade |

### 7.3 Empty states that teach by showing

An empty state shows a small picture of what will appear here, made of the real components drawn as
ghosts (dashed outline, `tertiary-foreground` text, "Example" tag; `aria-hidden`, with the same
example in the sentence), then one sentence and one accent action (A6).

| Motion | Cause | What moves | Timing | Tag | Repeats | Reduced |
| --- | --- | --- | --- | --- | --- | --- |
| **The picture assembles** | The empty view is first shown | Shared folders: a folder icon draws, its ribbon slides out, a dashed ghost row draws under it. Disks lane: empty caddy outlines slide into the bay. People: a person outline, then a second behind it (a group). Logs: three ghost lines draw left to right | `slow`, parts staggered, 600ms total | Teach (what belongs here) | First time per view per browser; then static | Static picture |
| **The ghost hands over** | The first real item is created | The real row rises into the ghost's place and the ghost fades as it lands | `slow`, `ease-enter` | Both | Once | Crossfade |
| **Filter cleared** | "Clear search" in a filtered-empty table | Rows fade back in with the list entrance stagger | foundation "List entrance" | Teach | Every time | Instant |

### 7.4 Forms

| Motion | Cause | What moves | Timing | Tag | Repeats | Reduced |
| --- | --- | --- | --- | --- | --- | --- |
| **The path draws as you fill** | Each answer in Add a shared folder | The lineage strip in the rail: typing a name turns the folder node from dashed to solid and its name appears; choosing a drive draws the line from the drive; choosing who adds avatars into the people node one by one (stagger) with a count glide; turning Windows and Mac on draws the line from the folder to that node; turning it off retracts the line on the exit curve and dashes the node | node `base`; lines `slow`; avatars stagger; retract `base` `ease-exit` | Teach (this is what you are exposing, to whom, over what) | Every change (each is news) | Lines and nodes appear or vanish with a crossfade |
| **Add a person's access fans out** | Ticking a group chip | Lines fan from the group node to the folders it opens, and each folder's access level appears beside it | `slow`, stagger | Teach (a group gives access) | Every change | Crossfade |
| **A summary sentence changes** | Any answer that changes a consequence | The changed sentence crossfades its words; a new sentence rises in (`animate-rise`), a removed one leaves (`animate-leave`); a sentence that carries data loss enters with the warning icon drawing its triangle | `base` | Teach (which consequence your answer just changed) | Every change | Instant |
| **Choice card picked** | Selecting a card | The radio dot lands on the settle spring; the selection edge draws round the card; for RAID levels the card's small block glyph morphs into the large Arrangement drawing beside the cards (shared element) | dot `fast` `ease-settle`; edge `base`; morph `slow` | Both | Every selection | Edge appears; drawing crossfades |
| **More options reveals** | Opening the disclosure | Height on the soft spring (foundation "Disclosure"); the "1 changed" count glides when it changes | `slow` `ease-soft` | Teach | Every time | Opens at once |
| **Password strength** | Typing a password | The strength line glides to its length and its word crossfades ("Weak" to "Strong") | `glide` | Teach | Every change | Instant |
| **Suggested password** | "Suggest a strong password" | The field's text crossfades to the suggestion and the copy icon turns into a check when copied | `fast` | Teach | Every time | Instant |
| **Errors on submit** | Pressing the primary with problems | Focus moves to the error summary, which rises in; each field with a problem draws its critical edge once (from the left, `base`) | `base` | Teach (where the problem is) | Every submit | Edge and summary appear |
| **The run** | Pressing Create | The rail's summary crossfades into the job runner; each step's disc: the current one carries a progress ring stroke in the accent (A3); a finished step's ring closes into a check | ring per step's duration; check `base` | Teach | Every run | Ring as static progress, check appears |
| **It is live** | The create run succeeds | One travelling light runs along the lineage strip from the drive to the people, once, and the done panel rises in | `glide`, `ease-standard` | Both (it now reaches them) | Every create | Done panel fades in |
| **Save settle and pending flight** | Save on a settings form | Foundation "Save settle" and "Pending flight" unchanged; the first time ever, the G2 tip line rises in where the save bar was | foundation | Teach | Flight every save; tip once | Foundation's reduced forms |
| **Impact sharpens** | A network answer changes the impact class | The impact line's icon morphs (check screen to warning triangle) and the network drawing's line between this browser and the NAS opens a gap | `base` | Teach (this change may cut you off) | Every change | Swap with a crossfade |

### 7.5 Tables

| Motion | Cause | What moves | Timing | Tag | Repeats | Reduced |
| --- | --- | --- | --- | --- | --- | --- |
| **A row moves to its group** | A refresh or a live reading changes a row's status or group (a disk turns Warning, a file system is mounted) | The row slides to its new place (FLIP) while the others close up; its status pill crossfades and its leading edge shows the status wash once, fading over `glide` | slide `slow` `ease-soft`; wash `glide` | Teach (what changed, and that it moved) | Every change; never while the pointer or focus is in the table, where a chip "1 row changed · Show" appears instead | Rows swap with a crossfade |
| **A new row arrives** | Returning from a create | The row rises into its group and gets the foundation's arrival ring | `slow` | Teach (here is what you made) | Every create | Ring without movement |
| **A row leaves** | Delete or remove | `animate-leave`; the group count glides | `base` | Teach | Every time | Instant |
| **Sort** | Sorting by a column | Rows reorder by FLIP when the page holds 50 rows or fewer; more than that is a cut. The header arrow turns on the settle spring | `base` | Teach | Every sort | Cut |
| **Expand a row** | The chevron | Foundation "Disclosure"; the detail's facts fade in after the height lands | `slow` `ease-soft` | Teach | Every time | Opens at once |
| **Selection bar** | First row selected | The toolbar crossfades into the selection bar, which drops 8px into place; the count glides | `base` | Teach (bulk actions now apply) | Every time | Crossfade |
| **Quick actions appear** | Pointer over or focus in a row | The row's one or two quick buttons fade in beside the always-visible More button | `fast` | Teach | Every hover, with a 80ms intent delay so passing the pointer over rows does not flicker | Appear at once |
| **Copy** | A copy button | The copy glyph turns into a check for 1.5s | `fast` | Teach | Every time | Swap |
| **Bars** | First paint of a usage column | Bars fill from zero on the first visit to the page in this browser, then draw at value; on a change they glide | `glide` | Teach | First visit only; changes always | At value |

Rejected for tables: per-cell value glides in live tables (processes update every 5 seconds; 40
cells gliding at once is noise); row highlight flashes on every live update.

### 7.6 Dashboard

| Motion | Cause | What moves | Timing | Tag | Repeats | Reduced |
| --- | --- | --- | --- | --- | --- | --- |
| **The NAS assembles** | First visit (7.2) | As in 7.2 | As in 7.2 | Teach | Once per browser | Fade |
| **A problem arrives** | A new item needs the person | Its row rises in at its place in B (worst first); the answer's words crossfade ("All OK" to "1 thing needs you"); in the map, the node with the problem takes its status mark and its lineage lights once from that node outward (the foundation's trace, run once by itself) so the person sees what is at risk | row `slow`; trace `glide` | Teach (what is affected) | Every new problem | Row appears; lineage shown lit without travel |
| **A problem resolves** | An item no longer needs the person | Its row leaves (`animate-leave`); the area chip's pill crossfades to the plain OK form and its check draws | `base` | Both | Every time | Instant |
| **Area chip** | Pressing a chip in A | Scrolls to the lane and rings it (foundation "Arrival") | foundation | Teach | Every press | Ring, no scroll animation |
| **Live readouts** | Each sample | Foundation "Live line" and "Value glide": the only loop on the dashboard, and only while sampling | foundation | Teach (what is live) | While live | Redraw in place |
| **A disk goes to sleep** | A disk's power state changes to asleep between readings | The slot's platter arc turns a quarter and slows to a stop, a small moon fades in beside "Asleep" | `glide` `ease-exit` | Both | Every change, not on page load | Moon and word appear |
| **A disk wakes** | Power state to awake | The moon fades, the arc turns a quarter on the enter curve | `slow` `ease-enter` | Delight | Every change | Instant |
| **Space changes** | A file system's usage changes between reads | Its bar and figures glide; crossing the warn tick adds the pill with the foundation's settle | `glide` | Teach | Every change | At value |
| **Pending in the map** | A save that makes a node pending | The pending badge pops onto that node as the flight lands in the top bar | `base` `ease-settle` | Teach (which thing is waiting) | Every save | Badge appears |

### 7.7 Icons that act out their action

Only on icons inside buttons and menu items (the thing that will act), on the button's own hover
(after an 80ms intent delay, once per hover-enter), on press, and on the action's success. Never on
navigation lists, table identity icons or decorative icons, and never on more than one icon at a
time. Each is a single short motion inside the 24px box; the icon's resting drawing is the end state.

| Icon | Hover or focus | Success | Tag | Reduced |
| --- | --- | --- | --- | --- |
| Share | The ribbon slides out 2px from the folder | The ribbon extends and settles | Both | Static; success shows the done state |
| Stop sharing | The ribbon retracts 2px | The ribbon tucks away and the stroke through it draws | Teach | Static |
| Create (plus mark) | The plus turns 90° on the settle spring | The plus becomes a check | Delight on hover, Teach on success | Static; check appears |
| Give access | The key slides 2px toward the object | The key turns a quarter | Both | Static |
| Mount / unmount | The arrow nudges into / out of the socket | The socket closes / opens | Teach | Static |
| Check health | The pulse line traces once along its path | The line resolves into the result's status shape (with the word beside it) | Teach | Result appears |
| Wipe | Nothing on hover (no playfulness on a destructive entry) | On the confirm button's arm (foundation "Destructive arm") the three sweep strokes draw across once | Teach | Static |
| Delete | Nothing on hover | Lid lifts and closes once as the row leaves | Teach | Static |
| Apply | The check nudges toward the bar | The check slides into the bar | Teach | Static |
| Undo | The arrow turns back 30° | One quarter turn back | Teach | Static |
| Refresh | Nothing | One turn per refresh, not a loop; past 300ms the spinner takes over | Teach | Static |
| Copy now (copy job) | The dash travels from folder to folder once | Same, once more on success | Teach | Static |
| Blink light | Nothing | Rays pulse in time with the real light, only while it really blinks (a live indicator) | Teach | Rays shown still with "Blinking" |
| Restart | The loop arrow turns a quarter | Not shown: the page goes to the reconnect watch | Delight | Static |
| Status badge on an object | — | When a state changes, the badge's shape morphs by crossfade and a 0.9 to 1 scale (triangle to check) | Teach | Crossfade |

### 7.8 Diagrams

| Motion | Cause | What moves | Tag | Reduced |
| --- | --- | --- | --- | --- |
| Lineage strip draws (7.4) | Form answers | Lines draw, nodes fill | Teach | Crossfade |
| Trace (foundation) | Pointing at or focusing a node | Lineage lights, the rest dims | Teach | Same, no transition |
| Arrangement, a disk failing (foundation) | "Show a disk failing" | The disk greys and is crossed; lost blocks go dashed | Teach | Same, no transition |
| Erase picture | The confirmation's typed name matches | Strike-through lines draw across each partition, file system and folder on the disk, left to right, in step with the confirm button's fill | Teach (exactly what goes) | Struck through at once |
| Delete picture | Opening a delete dialog | The lines to what depends on the object draw, then the cut marks appear on them | Teach | Drawn |
| NFS reach | Choosing one computer, a network or any computer | One screen multiplies into a row inside the bracket (stagger); "any" lets the outer screens slide past the bracket's edge | Teach | Swap |
| Network change | An address or method change | The old address slides out of the NAS node, the new slides in; when the page will lose the NAS, the line from this browser opens a gap | Teach | Swap |
| Copy direction (foundation) | Arrival | A dash travels twice | Teach | Static |

### 7.9 Rejected, and why

| Idea | Why it is out |
| --- | --- |
| A modal product tour, coach marks with a spotlight, "tip 1 of 7" | Blocks the pro (R1), is skipped by most newcomers, and repeats; the map and the one accent teach without it |
| Confetti or a burst when something is created | Decoration with no meaning; and a celebratory green would borrow OK's hue (style guide 2.1). The travelling light along the lineage (7.4) is the celebration, and it says something |
| Shaking a field or a dialog on error | Punishes, does not say what is wrong, and is vestibular motion; the error summary and the drawn edge say where |
| A typing effect on the headline or the welcome | Delays reading the most important sentence on the page |
| A pulsing or breathing accent button, or a pulsing problem card | A loop with no work behind it; it would make the accent mean "busy" and make every page restless |
| Counting every figure up from zero on every visit | Delays reading for people who come daily; figures count from zero only the first time, then glide only on change |
| Parallax, or the ambient light following the pointer | Moves the page while it is being read; no meaning |
| Icons wiggling on hover in navigation and tables | Fires constantly as the pointer crosses a list; icon motions are for the button about to act (7.7) |
| Scrambled-letters reveal of a suggested password | Gimmick; confuses screen readers and anyone copying it mid-animation |
| A shimmer sweep across skeletons | The foundation's breathe is calmer and already chosen |
| Sliding page transitions in the direction of travel for every navigation | Tiring for a pro moving fast; the foundation's fade-and-rise stays |
| Animated gradients or glows | Not one of the four kinds of light (foundation 3.4) |

### 7.10 What style guide 10 changed in this section (2026-11-26)

The motion reel (prototype 7) builds the tables above with these changes, because
[style guide section 10](style-guide.md#10-the-generated-look-what-we-never-do) overrides this spec:

- **Out:** the empty state's picture assembling when an empty view is first shown, an entrance
  nobody caused (rule 19; the picture is static); the area chip motions, because area chips are gone
  (rule 15); the blink light's rays pulsing (rule 10; the state is the word "Blinking" beside a
  still icon); the live line's moving dot and the sparklines (rules 10 and 17).
- **Changed:** a row that changes state takes its status wash across the whole row once, not on a
  leading edge, and a field with an error turns its whole border critical, not an edge drawn from
  the left (rule 13); the table's "1 row changed" chip is a text button, "1 row changed. Show it"
  (rules 2 and 15); a first step's empty circle, not a number disc, becomes the check (rule 9);
  "It is live" is a stroke segment travelling the lineage strip, with no glow (rule 11); the copy
  direction's dash travels once per cause, not twice (7.1 rule 1).
- **Added:** fades finish within 400ms of their cause; only movement, drawing and value glides may
  run longer, at full opacity. So the NAS assembling fades each part in over 160ms (all visible by
  about 320ms) while the slides, connectors and bars run to about 900ms; a cleared filter's rows
  rise 45ms apart but fade 20ms apart; an expanded row's facts fade in as the height lands, not
  after; a sleeping disk's moon and the "Almost full" label fade in over 160ms while the arc's turn
  and the settle keep their length. The reel checks this for each motion.
- **Changed:** a sleeping disk's arc turns on the standard curve, which slows to a stop (the exit
  curve speeds up). "Sort by size" sorts disks, because the backend gives no folder sizes (rule 17).
- **Waiting:** the icon motions for stop sharing, delete's lid and the copy job's dash need the
  custom icon set of prototype 6. The library's `Icon` already draws create, undo, restart, apply,
  check health, share, mount and wipe with their motions.

---

## 8. Prototypes for the lab

Built in the dev-only lab (`src/lab`, foundation 15), on Sky with both densities and themes, reached
by `?screen=` (selects a view, never acts: UI-4). The owner sees screenshots of each before anything
moves into the library or the app. The accent uses a placeholder token (`--lab-cta`) until the
colour is chosen, so the prototypes can be re-shot with each candidate.

| # | Prototype | `screen=` | Shows | Library pieces it needs (new marked *) |
| --- | --- | --- | --- | --- |
| 1 | **Dashboard: the NAS map** | `nas-map` | Regions A to E at 1440, 900, 390; both densities; states: **new NAS (welcome, ghosts, captions, first steps under A)**, **new interface on an existing NAS (one-line welcome)**, all OK, needs you, a disk Critical, 24 disks, 8 file systems, no shared folders, loading, a lane failing, tips off. Motion: the NAS assembling (first visit, then the plain fade), a problem arriving and resolving, a ghost becoming real, a disk going to sleep | *StatusLine with *AreaChip; *AttentionList (rows); *SystemMap (ConnectionMap extended to lanes, lane footers, capped lanes, *BayStrip, inline usage bars, service tiles, collapsing to disclosure rows at 390); DriveBay (slot tiles mode); *LiveStrip (LiveTile, Sparkline); *FirstStepsStepper (from Checklist); FactList; *Shortcuts; *WelcomeLine; *GhostNode; *LaneCaption; Icon set (subset) |
| 2 | **Form: Add a shared folder** | `add-folder` | The four questions, the outcome rail, defaults, More options with "1 changed", guest consequence, error summary after pressing Create with no name, the narrow sticky bar at 390, the run and done states, tips off. Motion: the path drawing as the form fills, summary sentences changing, the run, "it is live". A keystroke count for the pro walk | *FormLayout (questions + sticky rail, narrow bar); *FormSection (numbered question); *StatementRow; *ChoiceCard / *ChoiceCardGroup; *MoreOptions; *PeoplePicker (replaces the AccessGrid's first view; AccessGrid stays as "Show as a table"); *ToggleCard; *LineageStrip; *ConsequenceList; *ErrorSummary; *ActionBar; JobRunner; Field, Disclosure |
| 3 | **Form: Add a person** | `add-person` | The four questions, group chips saying what each opens, role cards, password strength and suggestion, the person-access lineage, HTTP notice inline. Motion: access fanning out from a group, strength glide | Everything from 2, plus *PasswordStrength and *SuggestPassword (in NewPasswordFields), *GroupChoiceChip, *RoleCard (a ChoiceCard variant) |
| 4 | **Table: Shared folders** | `folders-table` | Summary line, filter chips, identity with icons, status first (one folder not reachable), reached-by, who-can-open, drive bar, row quick actions on hover and focus, the More menu, expanded row with copyable path, bulk selection bar, **teaching empty state with a ghost row**, filtered-empty, error, loading, compact, list at 390. Motion: a row moving to its group on a status change, a new row arriving, selection bar, the empty picture assembling and handing over | *DataTable (on Table: roving grid focus, selection, expand, groups); *ObjectCell; *StatusCell; *NumberCell and *UsageCell (CapacityMeter, small); *ServiceBadges; *RowActions; *RowDetail; *SelectionBar; *FilterChips; *TableSummary; *ResponsiveRows (list below 640px); EmptyState (inline-in-frame variant with *GhostRow); TableSkeletonRows; TableGroupRow |
| 5 | **Table: Disks** | `disks-table` | The bay above the table linked both ways, grouping (System, In use, Empty, Removable), kind icons, Unknown "Not checked yet", temperatures right-aligned, "Add storage" inline on empty disks, "Check health" as quick action and bulk action, technical columns switch. Motion: health check icon tracing, a slot and its row both changing state, sleep and wake | All of 4, plus DriveBay (row link both ways, an NVMe caddy face), *TechnicalColumnsSwitch |
| 6 | **Icon sheet** | `icons` | Every icon of 5.3 and 5.4 at 16, 20, 24, 32 plate and 64 illustration, both themes, with status and pending badges, on a primary accent button (A5) and a plain button, beside lucide glyphs at the same size for the stroke comparison; the diagrams of 5.5 that are new (lineage strip, NFS reach, guest access, erase picture, network change). Each action icon with its hover and success motion (7.7), a replay button each | *Icon (one component, a name union, paths in code); *IconPlate; *IconBadge; the new drawings as library components |
| 7 | **Motion reel** | `motion` | Every motion of section 7 with its cause button ("Change a disk to Warning", "Create a folder"), a replay control, the reduced form beside the full one, and the timing in words; the "Animations: Reduced" switch; a check that nothing stays below full opacity 400ms after its cause | *Motion helpers in the library: `useFlip` (rows), `drawPath` (lineage, erase, check), `useFirstTime` (the G2 flag, P.3), `useReducedMotion` (the query and the preference) |
| 8 | **Guidance** | `guidance` | The four layers of P.3 on one page: G1 state-keyed (an empty NAS), G2 first-time tips and their "Got it", G3 disclosures, and the same screens with "Show tips" off; the "Hide tips too?" toast after switching to compact | *Tip (one line, dismissible, one at a time); *ShowTipsSwitch (account menu and palette); the tips preference store |

After the owner's look, the agreed pieces go to the design-system-engineer with all seven control
states, both themes, both densities and stories; the accent family goes through the colour audit
before any of it (style guide 8).

---

## 9. Copy for the catalogue (en, new or changed)

Keys follow the existing namespaces. Every string is plain words, sentence case, units with a
non-breaking space.

```
cta.create = Create {{name}}
cta.createFallback = Create shared folder
cta.addPerson = Add {{name}}
cta.addPersonFallback = Add person
form.moreOptions = More options
form.moreOptionsChanged = More options · {{count}} changed
form.errorSummary_one = 1 thing to fix
form.errorSummary_other = {{count}} things to fix
form.takesEffectOnCreate = Takes effect when you press Create.
form.takesEffectOnAdd = Takes effect when you press Add.
form.savedWaits = Saved changes wait in the yellow bar until you apply them.
form.discardQuestion = Discard your changes?
form.keepEditing = Keep editing
form.discard = Discard changes
form.skipToSummary = Skip to summary
form.review = Review

addShare.q.name = What is it called?
addShare.q.where = Where are its files kept?
addShare.q.who = Who can open it?
addShare.q.how = How will computers reach it?
addShare.where.statement = Files are kept on {{drive}} · {{free}} free
addShare.who.everyone = Everyone here can read and change files
addShare.who.readSomeWrite = Everyone can read; some can change
addShare.who.chosen = Only the people I choose
addShare.how.smb = Windows and Mac (SMB)
addShare.how.nfs = Linux and media players (NFS)
addShare.nfs.which = Which computers?
addShare.nfs.one = One computer
addShare.nfs.home = Computers on my home network ({{range}})
addShare.nfs.any = Any computer
addShare.sum.creates = Creates {{name}} on {{drive}} ({{free}} free).
addShare.sum.people_one = 1 person can read and change files. Nobody else can open it.
addShare.sum.people_other = {{count}} people can read and change files. Nobody else can open it.
addShare.sum.address = Windows computers open it at {{windows}}, Macs at {{mac}}.
addShare.sum.smbOn = Turns on Windows and Mac sharing for the whole NAS.
addShare.sum.guest = Anyone on your network can open it without a password.

addPerson.q.who = Who is it?
addPerson.q.signIn = How will they sign in?
addPerson.q.open = What can they open?
addPerson.q.powers = What may they change?
addPerson.suggest = Suggest a strong password
addPerson.strength = {{word}}: {{count}} characters
addPerson.role.user = Uses shared folders
addPerson.role.userLine = Opens the shared folders they are given. Can change their own password.
addPerson.role.admin = Administrator of this NAS
addPerson.role.adminLine = Can change every setting, and read and delete every file.
addPerson.group.opens = Opens {{folders}}
addPerson.sum.adds = Adds {{name}}, who signs in as {{name}}.
addPerson.sum.opens = Can open {{list}}.
addPerson.sum.through = through {{group}}
addPerson.sum.noSettings = Cannot change the NAS's settings.
addPerson.sum.admin = Can change every setting on this NAS.

storage.sum.erases = Erases everything on {{disks}} ({{sizes}}).
raid.sum.makes = Makes a {{level}} with {{usable}} you can use.
raid.sum.survives_one = Keeps working if 1 disk fails.
raid.sum.survives_other = Keeps working if {{count}} disks fail.
raid.sum.survivesNone = If any disk fails, everything on all of them is lost.
raid.card.usable = {{usable}} usable of {{total}}
raid.card.needMore_one = Choose 1 more disk
raid.card.needMore_other = Choose {{count}} more disks
raid.cta = Erase and create {{level}}

table.actionsFor = Actions for {{name}}
table.selected_other = {{count}} selected
table.clearSelection = Clear
table.noMatch = No {{thing}} matches "{{query}}".
table.clearSearch = Clear search
table.readAt = Read at {{time}}
table.liveFrozen = Live · paused while you point at a row
table.sortBy = Sort by
table.technical = Technical columns
table.showAll = Show all {{count}}
sharedFolders.summary = {{count}} shared folders · {{bad}} not reachable · {{smb}} shared with Windows and Mac
sharedFolders.notShared = Not shared
sharedFolders.nobodyYet = Nobody yet
sharedFolders.notReachable = Not reachable: its file system is not mounted.
disks.group.system = System disk
disks.group.inUse = In use
disks.group.empty = Empty, ready to use
disks.group.removable = Removable and optical
disks.notCheckedYet = Not checked yet
disks.empty.addStorage = Add storage
logs.today = Today
logs.yesterday = Yesterday
logs.errorFilter = Lines with "error" or "fail"
logs.followNewest = Follow newest
processes.programs = Programs
processes.all = All
processes.stopped = Stopped or finished

dash.answer.ok = All OK
dash.answer.needs_one = 1 thing needs you
dash.answer.needs_other = {{count}} things need you
dash.region.nas = Your NAS
dash.lane.disks = Disks
dash.lane.storage = Storage
dash.lane.folders = Shared folders
dash.lane.waysIn = Ways in
dash.lane.network = Network
dash.lane.more = {{count}} more, all OK
dash.lane.feeds = Feeds {{names}}
dash.shortcuts = Shortcuts
dash.thisNas = This NAS

welcome.newNas.title = Welcome to your NAS
welcome.newNas.body = It is running. Here is what is in it, and what to set up first.
welcome.newUi.body = Welcome to the new interface. Your settings and files are the same; only the way you see them is new.
welcome.newUi.whatChanged = What is different
welcome.newUi.classic = Open the classic interface
welcome.gotIt = Got it
ghost.example = Example
ghost.storage = Your storage will appear here
ghost.folder = Your first shared folder will appear here
caption.disks = These are the disks the NAS found.
caption.storage = Storage is a disk made ready to keep files.
caption.folders = A shared folder is what your computers open.
caption.waysIn = How your computers reach the shared folders.
caption.network = How the NAS is connected to your network.
empty.folders = No shared folders yet. A shared folder is a folder your computers can open over the network, for example Photos for the whole family.
empty.people = Nobody else uses this NAS yet. Add the people who will open its shared folders, each with their own password.
tip.firstSave = Saved. Your change waits in the yellow bar at the top until you apply it.
tip.palette = Press / to go anywhere
tip.trace = Point at a box on the map to see what it feeds
tips.show = Show tips
tips.hide = Hide tips
tips.offerAfterCompact = Compact view on. Hide tips too?
reassure.nothingYet = Nothing changes until you press {{action}}.
reassure.filesStay = Your files stay on the disk.
reassure.undo = You can undo it from the yellow bar before applying.
reassure.later = You can change this later on its own page.
motion.preference = Animations
motion.full = Full
motion.reduced = Reduced
table.rowsChanged_one = 1 row changed · Show
table.rowsChanged_other = {{count}} rows changed · Show
```

---

## 10. Accessibility and states, across the patterns

- **Keyboard**: forms (3.10), tables (4.7), the map (each node focusable in reading order lane by
  lane; focusing a node traces its lineage, as ConnectionMap does; the lane footer actions are
  buttons after the lane's nodes).
- **Screen readers**: the outcome picture is `aria-hidden`, the summary is a list read in order and
  is a polite live region that announces only the sentence that changed, debounced 1s. The error
  summary is focused and announced once. Lanes are regions with headings; slots and nodes have names
  that include their state ("sdb, Warning, 41 °C").
- **Never colour alone**: the accent is a fill on a button with a verb; status keeps words and
  shapes; selected rows keep the checkbox; the "changed" count on More options is a number.
- **Contrast**: the accent family audited before use (1.3); choice-card selected edge 3:1 on all
  grounds (blue, already audited as `action`).
- **200% zoom and 320px**: forms collapse to one column with the sticky bottom bar; tables become
  lists; the map becomes lane disclosure rows. No sideways scrolling except inside a table's own
  region in technical-columns mode.
- **Reduced motion**: the outcome picture updates without transition; lines appear without drawing;
  slots do not lift.
- **Targets**: row quick actions and the More button are 28px in comfortable, 24px in compact; lane
  footer actions 32px; mobile buttons 44px.
- **Guidance**: tips are text beside their control, never over it (no popover that hides a field); a
  tip that appears is announced politely once; "Got it" is a real button; nothing times out a tip a
  person is reading. Ghost content is `aria-hidden` and its example is in the sentence.
- **Motion**: section 7.1 rule 5; the "Animations: Reduced" preference applies the same reduced
  tokens as the system setting; no motion starts without a cause the person can see; nothing flashes
  more than three times a second (the blink icon pulses at the hardware's rate, which is below it).
- **Security**: nothing here renders backend text as markup (names, messages and service output are
  text, UI-2); icons and drawings are components from data, no SVG strings (UI-2, UI-7); geometry by
  classes and SVG attributes, custom properties only through the CSSOM as the lab does (UI-1); no
  URL acts (the lab's `screen=` selects a view, UI-4); suggested passwords are generated in the
  browser, never stored, never echoed after the form is left (UI-6); the remembered "More options"
  and log choices hold no server data (UI-13).

---

## 11. The adversarial pass

Walked twice over the three journeys this spec changes most (add a shared folder, read the disks
table, open the dashboard).

### As someone trying to break it

| Case | Finding | Answer in this spec |
| --- | --- | --- |
| 0 people besides the admin | "Everyone here can read and change files" would mean only the admin | The preset says the count ("Everyone here (1 person)"); with only the admin, the default becomes "Only the people I choose" with the admin preselected |
| 1000 people | The people picker and "Can open" column | Picker searches and virtualises; preset cards stay the first view; "Can open" stays technical (decision 4) above 25 visible rows |
| 0 file systems | Question 2 has nothing to offer | The form does not open: the page says "Add storage first" with the button (accent) and the Erase picture explaining why |
| Only the system drive | Folders on the system drive are a known foot-gun | Not offered by default; "Use the system drive" in More options with its consequence in the summary (warning shape) |
| A 200-character folder name | Rail and lineage strip | The strip truncates with the full name in its accessible name; the summary wraps (it is text); the button says "Create shared folder" past 32 characters |
| A right-to-left name, a markup-looking name | Summary sentences interpolate names | Names are React text inside `bdi`; the sentence's own direction holds |
| Refresh or back mid-form | Typed values lost | Unchanged behaviour (the form is not persisted; UI-13 forbids storing server data); `Escape` and back with changes ask first |
| A second tab adds the same folder | Name availability checked against stale data | The create step's own error from the backend shown as text on that step; the run says what was already made |
| Session expires mid-form | Pressing Create | The run's first step fails with the sign-in prompt; nothing was made; the form keeps its values in memory until the page is left |
| A task fails mid-create | Partly made folder | The run states what was made and offers "Try again" for the failed step (exists in AddShareRun) |
| Pending changes from another administrator | The create flow applies everything | Unchanged: the flow does not start while anything is pending (FlowPreflight); the summary cannot hide this |
| 24 disks, 8 file systems, 40 folders | Dashboard holes or overflow | Lanes capped (6.4); C's height capped; "+N" nodes |
| Every disk Critical | The accent and Critical fighting | One filled accent (the worst row's step); Critical keeps the pill and wash; the squint test is part of the lab screenshots |
| Live readings stop | The strip shows stale numbers as live | "Last reading 10:36" replaces "Live"; sparklines show the gap (exists) |
| Service output changes format | The connections table | Falls back to the raw text with a note (4.9) |
| Two administrators, one new NAS | G1 guidance shown to both | Keyed to the NAS's state, so it ends for both when the first folder exists; G2 tips are per browser and do not cross |
| A pro clears site data | Tips and the welcome come back | Accepted (UI-13 keeps them in the browser); "Show tips" is one palette command away, and G1 never returns on a set-up NAS |
| Tips on, every screen | Tips pile up | At most one G2 tip at a time; G1 captions only on empty lanes; a set-up NAS shows none |
| A motion interrupted | Pressing Create twice, sorting during a FLIP | The second cause lands the first at its end state; the button's pressed and loading states stop a second submit |
| 40 rows change status at once | A wall of sliding rows | More than 10 changed rows reorder with a crossfade, not a slide; with focus in the table, only the "rows changed · Show" chip |

### As someone who cannot see it

| Case | Finding | Answer |
| --- | --- | --- |
| Tab through Add a shared folder | Today 40+ stops (21 access segments) | Preset cards are one radio group; the picker is one tab stop with arrows; about 12 stops to Create; `Ctrl Enter` from anywhere |
| Hearing the consequence | Today the consequences are scattered help text | The summary is a list after the questions, reachable by "Skip to summary"; changes announced politely, debounced |
| Disabled Share today gives no reason on focus | | The primary is never disabled; errors are announced and linked |
| The disks table | "Not checked" has no shape; temperatures unlabelled | Unknown with its hollow ring and word; the temperature header and unit read with each cell |
| The map | Lines carry meaning | Each node's name says what it feeds; at 390 the words replace the lines; tracing is also announced ("Feeds Photos, Music") |
| Colour alone | Accent on primary only; status words everywhere; selected rows keep checkboxes; "changed" is a number | Holds in greyscale |
| First visit with a screen reader | The map assembling | Announced once as "Your NAS: 6 disks, 1 storage, no shared folders yet"; the animation is visual only; ghosts are hidden and the captions are read as each lane's description |
| Reduced motion | Does any meaning depend on a motion? | Walked through 7.2 to 7.8: every row has a reduced form whose end state carries the same words |
| 200% zoom | Rail would squeeze controls | Rail becomes the bottom bar below 1024px of CSS width |

---

## 12. Defects found while capturing (fix regardless of the redesign)

1. The SSH hint on Add a person renders "this person" as a mono identifier before a name is typed
   (`personCan.sshHint` with `addPerson.thisPerson` in the `<name>` element).
2. A shared folder whose file system is not mounted shows OK on its page and in the table.
3. Disks: HEALTH "Not checked" has no status shape and uses a word outside the fixed set.
4. Shared folders: the SHARING cell is empty for an unshared folder.
5. Add a shared folder: the default (sharing on, nobody has access) produces a folder nobody can open,
   and on the folder page "Share" is disabled with its reason below the button.
6. Services status: the SMB output runs past the right edge at 1440.
7. System logs: a right-to-left message aligns the cell to the right edge.
8. Pagination controls appear for a single row.
