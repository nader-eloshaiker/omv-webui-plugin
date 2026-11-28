# Plan: re-founding the interface's look

Status: agreed with the owner on 2026-11-23 (journal, "The interface's look is re-founded"). This file
is the plan of record for the redesign and the order of the remaining work. Update it as steps
finish; do not delete it until Phase 6 ships.

## Why

The owner looked at the built interface and rejected it. It reads like a document rather than an
app: walls of explanatory prose, long single-column pages, key/value tables where a picture would
say more, every card the same flat box, and a navigation of about 40 equal text rows. There is no
considered layout, no visual appeal and no animation, and nothing gives anyone a reason to use it.

The cause is the founding brief, not individual pages. `docs/design/style-guide.md` asked for
"calm" and "appliance-like" (section 1), about 90% neutral by area (2.1), no gradients (3.10), flat
surfaces with hairline borders (4.3) and motion that "never entertains" (4.5). Every slice followed
it faithfully. The colour work (`design/tokens.css`, `tools/colour-audit.mjs`) exists, but was used
only as a budget for status colours.

## What stays

The engine is sound and is kept: the contract and generated client, the transport, the hooks and
queries, the safety flows for destructive and risky actions, the copy logic, the tests, the mock
scenarios, the VM suite, and the `UI-*` security rules. Status honesty (a word plus a shape, never
colour alone), WCAG 2.2 AA contrast, colour-vision safety and `prefers-reduced-motion` stay as
constraints, but they are no longer the aesthetic.

## What changes

The brief, the visual language, the component skins and the composition of every page.

## The owner's direction

- **Re-found it, don't polish it.**
- **Modern and not tacky, imitating nothing.** It should not copy any existing NAS interface, nor the
  effect showcases of CSS social posts (glass everywhere, neon glow, rainbow gradient borders, bouncy
  3D tilts), which look dated. Take techniques, not looks.
- **Clever, subtle animation that improves the UX.** Motion explains where a thing came from and went,
  what changed, what is live and what is working. It confirms a save or a toggle and guides attention.
  It is never gratuitous, slow or blocking.
- **Dark first**, with light as the second theme. Both are first-class.
- **Affordance first, without slowing pros down.** Systems like this intimidate new users. It must be
  obvious what is clickable, what each thing is for, what will happen before it happens and what to
  do next. That means clear interactive cues, guided first steps, sensible defaults, explanations
  on demand rather than walls of prose, previews and undo where possible, and empty states that
  teach. It must also stay fully functional for pros:
  - a command palette, quick jump and keyboard shortcuts;
  - dense views where they help;
  - bulk actions;
  - technical details (device names, paths, raw values) one disclosure away and copyable;
  - no forced wizards for people who know what they want.

  One interface serves both, through layers of progressive disclosure, not two separate modes.

- **Custom SVG pictures and diagrams wherever they remove ambiguity.** A picture tells a thousand
  words. Examples:
  - a drive-bay picture with each disk's slot, health and role;
  - how disks combine (RAID levels; ZFS mirror, stripe and raidz), drawn before anything is
    committed;
  - a map from disk to file system to shared folder to SMB or NFS share to who can reach it;
  - the network path from this browser through an interface to the NAS, with bonds, VLANs and
    bridges as layers;
  - rsync's direction;
  - capacity rings and meaningful service glyphs;
  - empty states that teach the next step;
  - destructive confirmations that show exactly what goes away.

  The pictures are one consistent illustration language: stroke, grid and radius, themed through
  `currentColor` and custom properties, readable at 390 px, with a text alternative. They are
  React JSX built from props. Never raw SVG strings or `dangerouslySetInnerHTML` (`UI-2`), never a
  `<style>` inside an SVG, and no external assets (`UI-7`). Lucide stays for small interface icons.

- **Real rendered charts (owner, 2026-11-24)**, with axes, tooltips and live updates, possibly
  using Recharts. A new runtime dependency must pass `UI-1` (including Trusted Types) and `UI-11`
  (justified, size measured). Charts still show only what the open page has sampled (A7).

## Research notes (2026-11-23)

Ania Kubów's CSS posts on YouTube, Instagram and X are short effect showcases: an orbiting planet
scene in pure CSS, loading dots, CSS grid tricks, hover cards. Little of it is indexed beyond titles,
and the owner considers the looks dated. What carries over is the approach: effects made with native
CSS, keyframes and pseudo-elements rather than libraries.

The native features that make subtle, modern motion possible within this project's content security
policy (`style-src 'self'`, no inline style elements; setting styles from script through the CSSOM is
allowed) are:

- **View Transitions** (`document.startViewTransition`, `@view-transition`) for moving between pages
  and states;
- **`@starting-style`** for entry from `display: none`, so dialogs, popovers and toasts animate in
  without JavaScript;
- **`@property`**, to animate custom properties such as a meter's value, a ring's angle or a hue;
- **`interpolate-size` and `calc-size()`**, to animate to and from `auto` height, for disclosure
  sections;
- **scroll-driven animations** (`scroll()`, `view()`), only behind `@supports` so content is never
  stuck hidden, and only for non-essential motion;
- **anchor positioning**, for popovers and tooltips without a library, with fallbacks because
  support is uneven;
- **container queries and `:has()`**, for components that adapt to their space and state;
- **the Web Animations API**, for value changes and live data.

Every one of these respects `prefers-reduced-motion`. Check current support on MDN or caniuse
before relying on one, and treat each as progressive enhancement.

Sources: [Code with Ania Kubów (YouTube)](https://www.youtube.com/channel/UC5DNytAJ6_FISueUfzZCVsw),
[her X account](https://twitter.com/ania_kubow?lang=en-GB),
[her CSS planets pattern (GitHub)](https://github.com/B10nicle/css-planets),
[CSS-Tricks: scroll-driven animations, scroll states and view transitions](https://css-tricks.com/scroll-driven-scroll-triggered-scroll-states-and-view-transitions/),
[WebKit: scroll-driven animations with just CSS](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/),
[Chrome: what's new in web UI (I/O 2026)](https://developer.chrome.com/blog/new-in-web-ui-io26),
[Smashing Magazine: CSS Wrapped 2025](https://smashingmagazine.com/2025/12/state-logic-native-power-css-wrapped-2025/),
[Una Kravets: building a great UX with modern CSS](https://una.github.io/back-to-the-future-of-web-dev/).

## The plan

1. **Stop adding pages in the old look.** The network slice in progress is finished and merged,
   because its data and safety logic carry over. New domains wait until the new look exists.
2. **The foundation.** `docs/design/visual-foundation.md` replaces style-guide sections 1, 2.1, 3.10
   and 4.3, the motion rules in 4.5, and the page-composition guidance. It states which old sections
   survive. It covers:
   - the product feel and principles;
   - dark-first colour, used for expression: surfaces with depth, the brand sky blue as a real
     surface, and where gradients, tints and light are allowed and what they mean;
   - a type scale and hierarchy;
   - the layout grid and density;
   - elevation;
   - a motion system: tokens and a catalogue of named motions, each with its purpose and its
     reduced-motion version;
   - data visualisation, and the illustration and diagram language for custom SVGs;
   - the shell and navigation;
   - page archetypes, with prose moved into progressive disclosure;
   - how one interface serves both newcomers and pros (affordance, guided paths, the command
     palette, density, bulk actions);
   - **three distinct visual directions**, with a recommendation.
3. **Live prototypes.** `/ui/lab` runs on the mock only and is never in the production bundle
   (`UI-11`). It shows the three directions in dark and light on three screens:
   - **the dashboard**, as a cockpit: overall health, storage and capacity, disks, services, live
     sampled CPU, memory and network, what needs attention, and pending changes;
   - **storage**, with disks and file systems drawn visually;
   - **a detail page**, with a summary header and sections.

   It includes the shell and navigation and the key motions working. The owner picks a direction or
   mixes them.

4. **Rewrite the design system** to the chosen direction:
   - tokens: colour, type, space, elevation and motion;
   - the colour audit extended to check gradient and translucent grounds;
   - component skins;
   - charts and visualisation components;
   - the shell and navigation.
5. **Re-compose the built pages** in the new system: the dashboard and monitoring, disks and disk
   health, file systems and Add storage, RAID, ZFS, shared folders, users and groups, services
   (SMB, NFS, rsync, SSH), network, logs, processes, service status and the account pages. This is
   page composition, not new backend work. The tests are updated alongside.
6. **Process change for every slice from now on:** the owner sees screenshots or a prototype of the
   slice's screens in the new look before its build starts, not only its decision points. A "would
   someone want to use this every day" review is part of the browser check.
7. **Resume the domains** in the new look, in this order:
   1. **System:** date and time, notifications, certificates, updates and power, plus Workbench (the
      web interface's settings) and Monitoring settings.
   2. **Plugins list.**
   3. **Diagnostics:** System information, Performance statistics and Report.
   4. **Scheduled tasks.**
   5. **Phase 6:** the release gate, accessibility and both-theme passes, user documentation and
      release notes.

   Every menu item that comes with OMV is migrated; only items other plugins add stay classic.

   Decisions for the owner when they are reached:
   - **Scheduled tasks:** the methods run any command as root, so they need a security decision
     before design.
   - **Report:** it uses the download endpoint, whose fixed list in `UI-4` only the owner can widen.
   - **Performance statistics:** OMV keeps no history as numbers (A7), so the choice is live sampled
     charts, OMV's own images (which loosens the content security policy), or both.

## Status

| Step                                      | State                                            |
| ----------------------------------------- | ------------------------------------------------ |
| 1. Network slice finished and merged      | done: #20, `1a7181a`                             |
| 2. Visual foundation and three directions | done: `f58cedd`                                  |
| 3. Lab prototypes                         | done: `/ui/lab`, `f58cedd`                       |
| 4. Design system rewrite                  | done: #28, `08eeaa8`                             |
| 5. Re-compose built pages                 | in progress: dashboard, file systems, disks done |
| 6. Process change                         | in force from now                                |
| 7. Remaining domains                      | waiting on 5                                     |

Step 5 so far (2026-11-28): after the owner rejected the first reskin, the dashboard, the forms and
the tables were redesigned in [design/redesign-rethink.md](design/redesign-rethink.md) and
prototyped in the dev-only lab, and the owner approved the prototypes. The first dashboard spec is
kept, superseded, as [design/redesign-dashboard-first-pass.md](design/redesign-dashboard-first-pass.md).
[Style guide section 10](design/style-guide.md#10-the-generated-look-what-we-never-do) bans the
twenty habits of generated design. Done on `main`:

- **The dashboard** (#30, `85f6054`), designed whole in the lab with the owner and built from
  library pieces (`NasFront`, `ScanLine`, `Panel`, `SegmentBar`, `DiskTemperatures`,
  `DrivePicture`, and `LivePair`, `NasAnswer` and `FirstSteps` extended).
- **The accessibility check** (#32, `c18c692`): `pnpm test:browser:stories` runs axe, WCAG 2.2 AA,
  over the dashboard pieces' stories, outside `pnpm test`.
- **File systems** (#33, `3687372`): space used as `SegmentBar`, in the table and on a file system's
  page.
- **Disks** (#34, `ac92a8d`): every awake disk's temperature by kind (`DiskTemperatures mode="all"`).
- **Spacing and the connection notice** (#36, `a63207e`): the owner's feedback of 2026-11-28. Four
  spacing steps (style guide 4.7) in `Page`, `PageHeader`, `PageSection` and `PairStack`, on every
  page; the unencrypted-connection notice in the warning family.
- **A disk's page**: the health answer in the header, the disk drawn as its kind beside it (from the
  cache only, never a read of its own), what it holds as segment bars, and jump links to its
  sections.

Next: the remaining pages in the order of step 5: disk health, the rest of file systems and Add
storage, RAID, ZFS, shared folders, users and groups, services, network, logs and processes, and the
account pages.
