---
name: uiux-design
description: Standards for UI and UX design of the openmediavault web interface - what it should feel like, designing for NAS administration, layout and density, status and pending changes, interaction states, destructive actions, accessibility and plain-words copy. Triggers on UI design, UX, layout, dashboards, the look and feel of components, themes, dark mode, microcopy and design reviews.
---

# UI and UX design standards

How screens are designed and reviewed. The normative visual language is the
[style guide](../../../docs/design/style-guide.md); this skill is the method for applying it. Colour
decisions go through the `colour-theory` skill; implementation mechanics are in the `react` skill;
the component system is in `design-system`.

**Every design is checked against the generated look first.** [Style guide section
10](../../../docs/design/style-guide.md#10-the-generated-look-what-we-never-do) lists twenty habits
of generated design and what replaces each (owner, 2026-11-25), and it overrides this skill, the
visual foundation and any spec that asks for one. A screen, a prototype or a review that uses one of
them is not done. The ones most easily reached for: arrows and chevrons on buttons and links, `·`
between values, eyebrow labels, everything in a card, numbered steps, pulsing or "live" dots, glows
and frosted blur, coloured left edges, rows of icon tiles, pills around the headline or as status,
invented figures, fragments set as sentences, and sections fading in. For each element ask what it
tells the person that nothing else on the screen does; if nothing, it goes.

---

## 1. What the product should feel like

A NAS console is opened to check that things are fine, to change one setting, or because something
broke. The first two should be quick and unobtrusive; the third must be unmistakable (style guide
1, now under visual foundation 1 and 2).

- **Calm**: almost everything is neutral; colour appears where the reader can act or the system
  reports something.
- **Dense but legible**: 14px body, compact rows, tight regular spacing; never small or low-contrast
  text.
- **Appliance-like**: stable layout, predictable controls, plain words, no marketing surfaces, no
  decoration that moves.
- **Honest about state**: every status is a word plus a mark; Unknown is its own state; saved but
  not applied is always visible.
- **Careful with destruction**: wiping a disk does not look or behave like saving a form.
- **Obvious affordance**: interactive things look interactive; visible labelled controls, never
  hover-only actions.
- **An unofficial community plugin**: no openmediavault logo artwork; the About screen says so.

## 2. Design for the administrator's work

The users are home and small-office NAS owners, many without Linux knowledge (`AGENTS.md` rule 11).

- **Lead with the answer**: worst state first ("1 of 4 disks: Critical"), healthy last.
- **Overview, then detail**: dashboard to storage to one disk, keeping context (breadcrumbs below the
  second level, preserved table state).
- **Pending changes are a workflow, not a notice**: save, see the banner, apply (or revert), watch the
  task, see the result. Design the whole loop, including "applying may cut this connection" for
  network and web-server changes.
- **Group navigation as OMV groups it** (System, Network, Storage, Services, Users, Diagnostics) so
  existing users find things.
- **The stock interface is still there**: anything not covered yet links to it plainly ("Open the
  classic interface").
- Progressive disclosure: advanced or rarely changed settings sit one obvious click away, never on
  the first view.

## 3. Layout, hierarchy and density

- One primary action per region; secondary actions visible but subordinate.
- Hierarchy by size, weight and spacing first; colour last.
- Dense means organised: aligned columns, tabular numerals, binary units always shown, identifiers
  in mono.
- Spacing from the 4px scale only (style guide 4.2); radius and elevation per style guide 4.3.
- Side navigation collapses to a drawer under 1024px. Usable at 320 CSS px wide and at 200% zoom
  without sideways scrolling, except inside a data table's own scroll region.
- **Cap what a decision point asks of working memory.** A choice between mutually exclusive options
  caps at four; five to seven need grouping. An independent option set (filters, checkboxes) caps at
  nine before grouping. A form is answered field by field and is not a decision point.

## 4. Status, pending and colour

- The status words are fixed: OK, Warning, Critical, Unknown, plus Disabled and Stopped (style guide
  5.5). No synonyms per page.
- Yellow appears at size only as the pending banner; the pending item carries the small pending
  mark.
- Colour never carries meaning alone. Read `colour-theory` before choosing a colour for any state.
- Every design is reviewed in both themes.

## 5. Interaction and feedback

- Feedback within 100ms: pressed states; a spinner past 300ms; skeletons of the right height for
  structural loads.
- **Four states for every async view**, designed, not defaulted: loading, error (the backend's
  message as text, with retry), empty (what belongs here and how to create it), populated. "No disks
  found" and "could not read disks" look different.
- **Seven states for every control**: default, hover, focus, active, disabled (with the reason),
  loading, error. A submit button without a loading state fires twice.
- **Saving is not applying.** The button says "Save"; the banner then offers Apply.
- **Destructive actions** follow style guide 5.4 and UI-8: a dialog naming the exact object and what
  is lost, including what depends on it; type-to-confirm for irreversible data loss; focus starts on
  Cancel; Enter does not confirm; no "don't ask again".
- **Tasks** follow style guide 5.7: title, state as a status label, elapsed time, output as text on the terminal
  pair, follow the tail, copy and download, cancel only where safe, result announced and kept until
  dismissed. A running task stays reachable from the top bar.
- **Toasts** confirm what the user just did; never the only record of a failure; never contain a
  secret or raw server output.
- Motion answers the person's action or a change of state and nothing else: no section fading in
  on load or scroll, nothing that pulses, breathes or blinks; reduced motion is honoured.
- Targets at least 24 by 24 CSS px; 44 by 44 where touch is the main input.

## 6. Security shapes the design

Some patterns are not available, by rule ([docs/05-security.md](../../../docs/05-security.md)):

- No rich text from the backend (UI-2): help text is part of the build, and backend text is shown as
  text.
- No link or redirect to an address the backend or the URL supplied (UI-3).
- A URL selects a view; it never performs an action (UI-4). There is no "click this link to apply".
- Secrets show as "Set" with "Change", never pre-filled (UI-6).
- When not on HTTPS, a persistent notice says passwords can be read on the network and points to
  OMV's HTTPS setting (UI-12).

## 7. Accessibility

WCAG 2.2 AA (style guide 6): contrast in both themes; never colour alone; full keyboard path; visible,
unobscured focus; one page title per page and ordered headings; labelled fields with errors linked by
`aria-describedby`; live regions for task results and save confirmations; charts with a text
alternative; sign-in that allows paste and password managers.

## 8. Copy

- **Plain words, no Linux knowledge assumed.** Say what a setting does for the user ("Let other
  computers on your network see this folder"), with the technical term second if at all.
- Short sentences, one idea each. No coined phrases; use the words already on screen.
- Buttons are verbs with their object ("Wipe disk", "Apply 3 changes"), never "OK" or "Submit".
- Destructive copy states exactly what will be lost, in one sentence.
- Units always shown, binary, one decimal, a non-breaking space before the unit.
- Sentence case, never uppercase labels. Every string comes from the i18n catalogue; layouts
  tolerate text 40% longer than English.
- **A label or a whole sentence, never a fragment set as a sentence** ("Shared folders: none", or
  "This drive holds the system itself, so it keeps no shared folders."; not "None yet."). A
  headline is a full short sentence ("Everything is working.").
- Values joined with commas or given their own labels, never `·`, `•`, `|` or `/`. No italic for
  emphasis, no emoji, and not the words "real" ("real-time") or "quiet" (except the drive's acoustic
  mode "Quiet, slower"). Every figure comes from a backend read.

## 9. Consistency

- Check `@omv-webui/react-ui-components` before designing a control; extend the system rather than
  fork a one-off.
- The same concept looks the same everywhere: one status label (its icon and word, no capsule),
  one meter, one confirmation, one banner.

## 10. Playbook

1. Name the question the screen answers and the action it leads to.
2. Inventory the system; list what is genuinely new.
3. Sketch hierarchy with size, weight and space, regions on the page ground under their headings
   (a card only for a thing handled as one unit); add status colour last, with words.
4. Design all four async states, every control's seven, and any destructive or pending flow.
5. Check both themes, contrast, keyboard path, reduced motion, 320px and 200% zoom.
6. Check every element against style guide 10, the generated look.
7. Hand off with the actual copy, not placeholders.

Where a domain has destructive actions, agree the design with the owner before it is built
([docs/07](../../../docs/07-implementation-plan.md#phase-5--coverage-by-domain)).

## 11. Reviewer checklist

1. [ ] Calm, dense, appliance-like; every element earns its place; affordances obvious?
2. [ ] Worst first; overview to detail keeps context?
3. [ ] Status words fixed; never colour alone; the pending gold only for pending?
4. [ ] Four async states and seven control states designed?
5. [ ] Save versus apply clear; pending loop designed end to end?
6. [ ] Destructive actions name the object and what is lost; type-to-confirm where irreversible?
7. [ ] No pattern that needs rich backend text, a supplied link or a URL that acts?
8. [ ] Plain words; units; verbs on buttons; strings in the catalogue?
9. [ ] Both themes, keyboard, focus, 320px, 200% zoom?
10. [ ] None of the twenty habits of style guide 10 (the generated look), element by element?

### The adversarial pass

Walk the main journey twice more and report what each pass found:

- **As someone trying to break it.** 0 items, 1, 1000. Refresh mid-flow, back, a second tab. The
  session expiring mid-form. A task failing. Pending changes from another administrator. A
  200-character share name, a right-to-left string and a string that looks like markup in every
  free-text field.
- **As someone who cannot see it.** Tab the whole journey without the mouse. Is focus always visible
  and in reading order? Does a screen reader hear loading, saved, applying and failed? Is any meaning
  carried by colour alone? Zoom to 200%.
