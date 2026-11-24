#!/usr/bin/env node
// Colour audit for the token system in design/tokens.css. No dependencies. Run from the repo root:
//
//   node tools/colour-audit.mjs                 # contrast + distinct + neutrals
//   node tools/colour-audit.mjs contrast        # one section; add --quiet for failures only
//   node tools/colour-audit.mjs legacy          # the measured defects of the stock OMV palette
//   node tools/colour-audit.mjs measure '#fff' '#5dacdf'     # one ad-hoc pair (fg, bg)
//   node tools/colour-audit.mjs measure '#8a4613' '#f78f00' 0.14 '#ffffff'   # fg on a wash over a base
//   node tools/colour-audit.mjs oklch 0.55 0.12 240          # OKLCH -> hex (for building ramps)
//
// `contrast` exits 1 when a REQUIRED pair fails, so it can gate CI. The PAIRS list below is the
// contract: a token family added to tokens.css gets its pairs added here in the same change.
// Every number quoted in docs/design/style-guide.md comes from this script.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = path.join(ROOT, "design/tokens.css");
const args = process.argv.slice(2);
const QUIET = args.includes("--quiet");
const positional = args.filter((a) => !a.startsWith("--"));
const section = positional[0];

// ---------- colour maths -------------------------------------------------------------------------
function parseHex(v) {
  const m = String(v).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const toHex = (rgb) =>
  "#" + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const toLin = (rgb) => rgb.map(lin);
const fromLin = (l) => l.map((x) => unlin(Math.min(1, Math.max(0, x))));

// WCAG 2.x relative luminance and contrast ratio.
const lum = (rgb) => {
  const [r, g, b] = toLin(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// APCA 0.0.98G-4g (the W3 reference constants). Returns Lc, signed: positive = dark text on light.
function apca(text, bg) {
  const y = ([r, g, b]) => {
    let Y = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
    if (Y < 0.022) Y += (0.022 - Y) ** 1.414;
    return Y;
  };
  const t = y(text);
  const b = y(bg);
  if (Math.abs(b - t) < 0.0005) return 0;
  if (b > t) {
    const s = (b ** 0.56 - t ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (b ** 0.65 - t ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

// OKLab / OKLCH (Ottosson).
function oklab(rgb) {
  const [r, g, b] = toLin(rgb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklch(rgb) {
  const [L, a, b] = oklab(rgb);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
function oklchToRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linRgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const inGamut = linRgb.every((x) => x >= -0.0005 && x <= 1.0005);
  return { rgb: fromLin(linRgb), inGamut };
}
// OKLab distance x100, so "2" is about one just-noticeable difference.
const dE = (a, b) => {
  const [x, y] = [oklab(a), oklab(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// Colour-vision deficiency simulation: Machado, Oliveira & Fernandes (2009), severity 1.0,
// applied in linear RGB.
const CVD = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};
const simulate = (rgb, kind) => {
  const l = toLin(rgb);
  return fromLin(CVD[kind].map((row) => row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
};
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

// ---------- token loading ------------------------------------------------------------------------
// Everything outside a `.dark { }` block is the light theme; the dark theme is light overridden by
// the `.dark` block. A value resolves to { rgb, a } within the theme being read: hex, `var(--x)`,
// `transparent`, `rgb(r g b / a)` and `color-mix(in srgb, <colour> N%, <colour> M%)` (premultiplied,
// as the browser mixes, so `color-mix(in srgb, X 14%, transparent)` is X at 0.14 alpha). Anything
// else (a shadow list, a gradient, a length) resolves to nothing.
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
function parseColour(value, lookup) {
  const v = value.trim();
  let m;
  if ((m = v.match(/^var\(--([\w-]+)\)$/))) return lookup(m[1]);
  if (v === "transparent") return { rgb: [0, 0, 0], a: 0 };
  const hex = parseHex(v);
  if (hex) return { rgb: hex, a: 1 };
  if ((m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/))) {
    const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
    return { rgb: [m[1], m[2], m[3]].map(Number), a };
  }
  if ((m = v.match(/^color-mix\(\s*in\s+srgb\s*,([\s\S]*)\)$/))) {
    const args = splitTop(m[1]);
    if (args.length !== 2) return null;
    const parsed = args.map((arg) => {
      const am = arg.match(/^(.+?)(?:\s+([\d.]+)%)?$/);
      return am && { colour: parseColour(am[1], lookup), pct: am[2] === undefined ? null : Number(am[2]) / 100 };
    });
    if (parsed.some((p) => !p || !p.colour)) return null;
    let [p, q] = parsed.map((x) => x.pct);
    if (p === null && q === null) [p, q] = [0.5, 0.5];
    else if (p === null) p = 1 - q;
    else if (q === null) q = 1 - p;
    const sum = p + q;
    if (sum <= 0) return null;
    const [A, B] = parsed.map((x) => x.colour);
    const [wa, wb] = [(p / sum) * A.a, (q / sum) * B.a];
    const a = wa + wb;
    const rgb = a === 0 ? [0, 0, 0] : A.rgb.map((c, i) => (c * wa + B.rgb[i] * wb) / a);
    return { rgb, a: a * Math.min(1, sum) };
  }
  return null;
}
function loadTokens() {
  const css = fs.readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const light = {};
  const darkOverrides = {};
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const target = /\.dark\b/.test(m[1]) ? darkOverrides : light;
    for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) target[d[1]] = d[2].replace(/\s+/g, " ").trim();
  }
  const resolve = (map) => {
    const get = (name, depth = 0) => {
      const v = map[name];
      if (v === undefined || depth > 8) return null;
      return parseColour(v, (ref) => get(ref, depth + 1));
    };
    return get;
  };
  return { light: resolve(light), dark: resolve({ ...light, ...darkOverrides }), names: Object.keys(light) };
}

// ---------- the contract -------------------------------------------------------------------------
// [foreground token, ground, bar, note]. Bars: "text" 4.5:1, "ui" 3:1 (large text, icons, control
// outlines, marks that carry meaning alone), "deco" = reported, never failed. A ground is:
//   - a token name, which must be opaque;
//   - on(base, ...layers): translucent tokens (a wash, the selected tint, the ambient light)
//     composited bottom-up over a known opaque ground, as the browser paints them;
//   - gradient(name, ...stops): a gradient, checked at every stop; the worst stop decides. Each stop
//     is itself a token or an on(). A two-colour gradient's contrast with one ink changes
//     monotonically along it when every channel moves the same way, as all of these do, so the end
//     stops are its darkest and lightest points.
// A translucent foreground is composited over the ground it is measured on.
const on = (base, ...layers) => ({ base, layers });
const gradient = (name, ...stops) => ({ name, stops });
const GROUNDS = ["theme-page", "theme-surface", "theme-muted", "theme-muted-strong"];
const onGrounds = (fg, bar, note, grounds = GROUNDS) => grounds.map((g) => [fg, g, bar, note]);
const STATUS = ["ok", "warning", "critical", "unknown"];
// The light from above the page: the bare page, each glow alone, and both where they overlap. The
// `ambient-light` utility lists the main glow first, so it paints over the soft one.
const AMBIENT = gradient(
  "ambient light",
  "theme-page",
  on("theme-page", "theme-ambient-soft"),
  on("theme-page", "theme-ambient"),
  on("theme-page", "theme-ambient-soft", "theme-ambient"),
);
// A status wash used as light: a radial wash in the card's corner fading to the bare card.
const statusLight = (s) => gradient(`${s} light`, "theme-surface", on("theme-surface", `theme-${s}-wash`));
// The drive-bay chassis: lit from above, one step between its stops.
const CHASSIS = gradient("chassis", "theme-art-chassis-top", "theme-art-chassis-bottom");
const DRAWING_GROUNDS = ["theme-surface", "theme-muted", "theme-art-surface"];

const PAIRS = [
  // Text tiers, on every ground and in the ambient light.
  ...onGrounds("theme-foreground", "text", "body text"),
  ...onGrounds("theme-muted-foreground", "text", "secondary text"),
  ...onGrounds("theme-tertiary-foreground", "text", "captions and metadata"),
  ...onGrounds("theme-subtle-foreground", "deco", "placeholder / disabled (exempt, 1.4.3)"),
  ["theme-foreground", AMBIENT, "text", "the headline and title in the ambient light"],
  ["theme-muted-foreground", AMBIENT, "text", "secondary text in the ambient light"],
  ["theme-tertiary-foreground", AMBIENT, "text", "captions in the ambient light"],
  // Structure.
  ...onGrounds("theme-border", "deco", "divider (decorative)"),
  ...onGrounds("theme-border-control", "ui", "control outline (1.4.11)"),
  ["theme-border-control", AMBIENT, "ui", "control outline in the ambient light"],
  // Action blue: the one interaction hue.
  ["theme-action-foreground", "theme-action", "text", "words on the primary button"],
  ["theme-action-foreground", "theme-action-hover", "text", "words on the primary button, hovered"],
  ...onGrounds("theme-action", "ui", "primary button edge / checked control"),
  ["theme-action", AMBIENT, "ui", "primary button edge in the ambient light"],
  ...onGrounds("theme-action-label", "text", "link and blue label"),
  ["theme-action-label", AMBIENT, "text", "link in the ambient light"],
  ...onGrounds("theme-focus-ring", "ui", "focus ring (2.4.11 / 1.4.11)"),
  ["theme-focus-ring", AMBIENT, "ui", "focus ring in the ambient light"],
  // The selected tint, and selected text.
  ["theme-action-label", on("theme-surface", "theme-selected"), "text", "label on a selected row"],
  ["theme-foreground", on("theme-surface", "theme-selected"), "text", "body text on a selected row"],
  ["theme-muted-foreground", on("theme-surface", "theme-selected"), "text", "secondary text on a selected row"],
  ["theme-action-label", on("theme-page", "theme-selected"), "text", "current side-navigation item"],
  ["theme-foreground", on("theme-page", "theme-selected"), "text", "current side-navigation item, ink"],
  ["theme-action", on("theme-page", "theme-selected"), "ui", "current item's leading bar"],
  ["theme-foreground", "theme-selection", "text", "selected text"],
  // Brand: the mark, the live dot, the health ring; and the live trace with its area fill.
  ...onGrounds("theme-brand", "ui", "the mark, the live dot, the health ring"),
  ...onGrounds("theme-trace", "ui", "the live trace", GROUNDS.slice(1)),
  ["theme-trace", on("theme-surface", "theme-trace-area"), "ui", "the trace over the top of its own area fill"],
  ["theme-trace", on("theme-muted", "theme-trace-area"), "ui", "the trace over its area fill, in an inset"],
  // Pending configuration changes: the yellow.
  ["theme-pending-foreground", "theme-pending", "text", "words on the pending band"],
  ...onGrounds("theme-pending-label", "text", "'pending' as a word on a ground"),
  ...onGrounds("theme-pending-stroke", "ui", "pending dot ring / icon"),
  ["theme-pending-label", on("theme-surface", "theme-pending-wash"), "text", "label on the pending wash"],
  ["theme-pending-label", on("theme-page", "theme-pending-wash"), "text", "label on the pending wash (page)"],
  ["theme-pending-label", AMBIENT, "text", "'pending' in the ambient light"],
  // Status: fills draw, labels are read, strokes outline, washes sit behind the one element in a
  // non-OK state.
  ...STATUS.flatMap((s) => [
    ...onGrounds(`theme-${s}-label`, "text", `${s} as a word`),
    ...onGrounds(`theme-${s}-stroke`, "ui", `${s} ring / icon (carries status with its word)`),
    ...onGrounds(`theme-${s}`, "deco", `${s} fill (always ringed by its stroke)`),
    ...GROUNDS.map((g) => [`theme-${s}-label`, on(g, `theme-${s}-wash`), "text", `${s} label on its wash`]),
    ["theme-foreground", on("theme-surface", `theme-${s}-wash`), "text", `body text on the ${s} wash`],
    ["theme-muted-foreground", on("theme-surface", `theme-${s}-wash`), "text", `secondary text on the ${s} wash`],
    [`theme-${s}-stroke`, on("theme-surface", `theme-${s}-wash`), "ui", `${s} mark on its wash`],
    [`theme-${s}-label`, AMBIENT, "text", `${s} as a word in the ambient light`],
  ]),
  // A non-OK card lit in its status: a radial wash fading to the card, read at both ends.
  ...["warning", "critical"].flatMap((s) => [
    [`theme-${s}-label`, statusLight(s), "text", `${s} word on the card lit in its state`],
    ["theme-foreground", statusLight(s), "text", `headline on the card lit ${s}`],
    ["theme-muted-foreground", statusLight(s), "text", `secondary text on the card lit ${s}`],
    ["theme-action", statusLight(s), "ui", `primary button edge on the card lit ${s}`],
  ]),
  // Destructive action.
  ["theme-destructive-foreground", "theme-destructive", "text", "words on the destructive button"],
  ...onGrounds("theme-destructive", "ui", "destructive button edge"),
  // Charts.
  ...[1, 2, 3, 4].flatMap((n) => onGrounds(`theme-series-${n}`, "ui", "chart mark", GROUNDS.slice(0, 3))),
  ["theme-usage", "theme-usage-track", "ui", "capacity meter fill on its track"],
  ["theme-usage-track-edge", "theme-surface", "ui", "capacity meter track outline"],
  ["theme-usage-track-edge", "theme-muted", "ui", "capacity meter track outline, in an inset"],
  // Drawings and maps.
  ...DRAWING_GROUNDS.map((g) => ["theme-art-line", g, "ui", "drawing outline"]),
  ...DRAWING_GROUNDS.map((g) => ["theme-art-path", g, "ui", "the traced lineage on a map"]),
  ...DRAWING_GROUNDS.map((g) => ["theme-art-faint", g, "deco", "secondary structure (decorative)"]),
  ["theme-art-line", CHASSIS, "ui", "a caddy's outline on the chassis"],
  ["theme-foreground", CHASSIS, "text", "a device name on the chassis"],
  ["theme-tertiary-foreground", CHASSIS, "text", "the chassis caption"],
  ...STATUS.map((s) => [`theme-${s}-stroke`, CHASSIS, "ui", `a ${s} slot light on the chassis`]),
  // Task output.
  ["theme-terminal-foreground", "theme-terminal", "text", "task and log output"],
  ["theme-terminal-muted", "theme-terminal", "text", "timestamps in task output"],
];
const BAR = { text: 4.5, ui: 3 };

const DISTINCT = [
  ["theme-ok", "theme-warning"],
  ["theme-ok", "theme-critical"],
  ["theme-ok", "theme-unknown"],
  ["theme-warning", "theme-critical"],
  ["theme-warning", "theme-unknown"],
  ["theme-critical", "theme-unknown"],
  ["theme-pending", "theme-warning"],
  ["theme-pending", "theme-ok"],
  ["theme-pending", "theme-critical"],
  ["theme-action", "theme-ok"],
  ["theme-action", "theme-unknown"],
  ["theme-brand", "theme-unknown"],
  ["theme-series-1", "theme-series-2"],
  ["theme-series-1", "theme-series-3"],
  ["theme-series-1", "theme-series-4"],
  ["theme-series-2", "theme-series-3"],
  ["theme-series-2", "theme-series-4"],
  ["theme-series-3", "theme-series-4"],
  // The live trace may share a chart with the series (the Performance page).
  ["theme-trace", "theme-series-1"],
  ["theme-trace", "theme-series-2"],
  ["theme-trace", "theme-series-3"],
  ["theme-trace", "theme-series-4"],
];
const neutralSteps = (names) =>
  names
    .filter((n) => /^color-slate-\d+$/.test(n))
    .sort((a, b) => Number(a.split("-").pop()) - Number(b.split("-").pop()));

// ---------- sections -----------------------------------------------------------------------------
const f = (n, d = 2) => n.toFixed(d);
const pad = (s, n) => String(s).padEnd(n);
const short = (s) => s.replace(/theme-/g, "");
const groundName = (g) =>
  typeof g === "string" ? g : g.stops ? `${g.name} (${g.stops.length} stops)` : `${g.layers.join("+")}/${g.base}`;

// The opaque colours a ground paints, one per stop, or null when a token is missing or a
// translucent token is used without a ground under it.
function paint(ground, get) {
  if (typeof ground === "string") {
    const c = get(ground);
    return c && c.a === 1 ? [{ rgb: c.rgb, name: ground }] : null;
  }
  if (ground.stops) {
    const stops = ground.stops.map((s) => paint(s, get));
    return stops.some((s) => !s) ? null : stops.flat();
  }
  const base = get(ground.base);
  if (!base || base.a !== 1) return null;
  let rgb = base.rgb;
  for (const layer of ground.layers) {
    const c = get(layer);
    if (!c) return null;
    rgb = over(c.rgb, c.a, rgb);
  }
  return [{ rgb, name: groundName(ground) }];
}

function contrast(themes) {
  let fails = 0;
  let checked = 0;
  const advisory = [];
  for (const [themeName, get] of Object.entries(themes)) {
    if (!QUIET) console.log(`\n== contrast: ${themeName} ==\n${pad("foreground", 26)}${pad("ground", 44)}ratio    Lc  bar   result`);
    for (const [fgName, ground, bar, note] of PAIRS) {
      const fg = get(fgName);
      const stops = paint(ground, get);
      if (!fg || !stops) {
        console.log(`MISSING TOKEN  ${themeName}: ${fgName} on ${groundName(ground)}`);
        fails++;
        continue;
      }
      // The worst stop decides; a translucent foreground is composited over each stop first.
      const [worst] = stops
        .map((s) => {
          const ink = fg.a === 1 ? fg.rgb : over(fg.rgb, fg.a, s.rgb);
          return { r: ratio(ink, s.rgb), lc: apca(ink, s.rgb), stop: s.name };
        })
        .sort((x, y) => x.r - y.r);
      const { r, lc } = worst;
      const where = stops.length > 1 ? `  (worst at ${short(worst.stop)})` : "";
      const need = BAR[bar];
      const ok = need === undefined || r >= need;
      if (need !== undefined) checked++;
      if (!ok) fails++;
      // APCA advisory: body text under Lc 60 passes WCAG but reads thinner than its ratio says.
      if (ok && bar === "text" && Math.abs(lc) < 60) advisory.push(`${themeName}: ${short(fgName)} on ${short(groundName(ground))}  ${f(r)}:1  Lc ${f(lc, 0)}  (${note})${where}`);
      if (!QUIET || !ok)
        console.log(
          `${pad(short(fgName), 26)}${pad(short(groundName(ground)), 44)}${f(r).padStart(5)}  ${f(lc, 0).padStart(4)}  ${pad(bar, 5)} ${ok ? (need ? "pass" : "-") : "FAIL"}  ${note}${where}`,
        );
    }
  }
  console.log(`\ncontrast: ${checked} required pairs checked, ${fails} failed.`);
  if (advisory.length) {
    console.log(`APCA advisory (text pairs that pass 4.5:1 but sit under Lc 60; fine for labels and bold, review for body copy): ${advisory.length}`);
    if (!QUIET) advisory.forEach((a) => console.log("  " + a));
  }
  return fails;
}

function distinct(themes) {
  for (const [themeName, get] of Object.entries(themes)) {
    console.log(`\n== distinct: ${themeName} ==  (OKLab dE x100; under ~10 a pair needs its word or icon to be told apart)`);
    console.log(`${pad("pair", 30)}normal  deutan  protan  grey dL`);
    for (const [a, b] of DISTINCT) {
      const [cx, cy] = [get(a), get(b)];
      if (!cx || !cy || cx.a !== 1 || cy.a !== 1) {
        console.log(`MISSING TOKEN ${a} / ${b}`);
        continue;
      }
      const [x, y] = [cx.rgb, cy.rgb];
      const cols = [dE(x, y), dE(simulate(x, "deutan"), simulate(y, "deutan")), dE(simulate(x, "protan"), simulate(y, "protan"))];
      const dL = 100 * Math.abs(oklab(x)[0] - oklab(y)[0]);
      const weakest = Math.min(...cols);
      console.log(`${pad(short(a) + " / " + short(b), 30)}${cols.map((c) => f(c, 1).padStart(6)).join("  ")}  ${f(dL, 1).padStart(7)}${weakest < 10 ? "   <- relies on word/icon" : ""}`);
    }
  }
}

function neutrals(themes) {
  console.log(`\n== neutrals ==  (one hue, low chroma; a step > 15 degrees off the median hue reads as another colour)`);
  console.log(`${pad("step", 18)}hex       L      C      H    drift`);
  const rows = neutralSteps(themes.names)
    .map((n) => [n, themes.light(n)?.rgb])
    .filter(([, v]) => v);
  const hues = rows.map(([, v]) => oklch(v)[2]).sort((a, b) => a - b);
  const median = hues[Math.floor(hues.length / 2)];
  let bad = 0;
  for (const [n, v] of rows) {
    const [L, C, H] = oklch(v);
    const drift = Math.abs(H - median);
    if (drift > 15) bad++;
    console.log(`${pad(n, 18)}${toHex(v)}  ${f(L, 3)}  ${f(C, 3)}  ${f(H, 0).padStart(4)}  ${f(drift, 1).padStart(5)}${drift > 15 ? "  <- off-hue" : ""}`);
  }
  console.log(`neutrals: median hue ${f(median, 0)}, ${bad} step(s) off-hue.`);
}

// The stock OMV workbench palette (workbench/src/scss/defaults/_colors.scss), measured so the guide
// can quote real numbers for what it changes.
function legacy() {
  const c = { white: "#ffffff", bg50: "#eef0f2", corporate: "#5dacdf", darker: "#1b7bba", yellow: "#f8d400", coffee: "#4d2e25", green: "#4cd964", jungle: "#1a231a", red: "#ff3b30", orange: "#f78f00", neon: "#33ff33", charleston: "#282828" };
  const rows = [
    ["white", "corporate", "white text on the corporate-blue top bar and primary button"],
    ["corporate", "white", "corporate blue as link / text on white"],
    ["corporate", "bg50", "corporate blue as text on the app background"],
    ["darker", "white", "'corporate darker' as text on white"],
    ["darker", "bg50", "'corporate darker' as text on the app background"],
    ["green", "white", "status green as a word on white"],
    ["red", "white", "status red as a word on white"],
    ["white", "red", "white text on the red (error / warn) fill"],
    ["yellow", "white", "warning / accent yellow as a word on white"],
    ["orange", "white", "dark orange as a word on white"],
    ["white", "orange", "white text on the orange fill"],
    ["coffee", "yellow", "coffee ink on the yellow fill"],
    ["jungle", "green", "jungle ink on the green fill"],
    ["neon", "charleston", "terminal neon green on charleston"],
  ];
  console.log(`\n== legacy OMV palette ==\n${pad("pair", 26)}ratio    Lc  note`);
  for (const [a, b, note] of rows) {
    const [x, y] = [parseHex(c[a]), parseHex(c[b])];
    console.log(`${pad(a + " on " + b, 26)}${f(ratio(x, y)).padStart(5)}  ${f(apca(x, y), 0).padStart(4)}  ${note}`);
  }
  const [y, r, g, o] = [c.yellow, c.red, c.green, c.orange].map(parseHex);
  console.log(`\naccent yellow and warning yellow are the same value (${c.yellow}): dE 0.0, one hue with two jobs.`);
  console.log(`green / red     dE normal ${f(dE(g, r), 1)}  deutan ${f(dE(simulate(g, "deutan"), simulate(r, "deutan")), 1)}  protan ${f(dE(simulate(g, "protan"), simulate(r, "protan")), 1)}`);
  console.log(`yellow / orange dE normal ${f(dE(y, o), 1)}  deutan ${f(dE(simulate(y, "deutan"), simulate(o, "deutan")), 1)}  protan ${f(dE(simulate(y, "protan"), simulate(o, "protan")), 1)}`);
}

// ---------- main ---------------------------------------------------------------------------------
if (section === "oklch") {
  const [L, C, H] = positional.slice(1).map(Number);
  const { rgb, inGamut } = oklchToRgb(L, C, H);
  console.log(`${toHex(rgb)}${inGamut ? "" : "  (out of sRGB gamut, clipped)"}`);
} else if (section === "measure") {
  // measure FG BG, or measure FG TINT ALPHA BASE for text on a wash composited over a known ground.
  const [fgArg, bgArg, alphaArg, baseArg] = positional.slice(1);
  const fg = parseHex(fgArg);
  const bg = alphaArg === undefined ? parseHex(bgArg) : over(parseHex(bgArg) ?? [0, 0, 0], Number(alphaArg), parseHex(baseArg) ?? [0, 0, 0]);
  if (!fg || !bg || (alphaArg !== undefined && (!parseHex(bgArg) || !parseHex(baseArg))))
    throw new Error("usage: measure '#fg' '#bg'  or  measure '#fg' '#tint' 0.14 '#base'");
  const [L, C, H] = oklch(fg);
  console.log(`${toHex(fg)} on ${toHex(bg)}: ${f(ratio(fg, bg))}:1, APCA Lc ${f(apca(fg, bg), 0)}; foreground OKLCH ${f(L, 3)} ${f(C, 3)} ${f(H, 0)}`);
} else if (section === "legacy") {
  legacy();
} else {
  const themes = loadTokens();
  const byTheme = { light: themes.light, dark: themes.dark };
  let fails = 0;
  if (!section || section === "contrast") fails = contrast(byTheme);
  if (!section || section === "distinct") distinct(byTheme);
  if (!section || section === "neutrals") neutrals(themes);
  if (section && !["contrast", "distinct", "neutrals"].includes(section)) {
    console.error(`unknown section '${section}' (contrast, distinct, neutrals, legacy, measure, oklch)`);
    process.exit(2);
  }
  process.exit(fails ? 1 : 0);
}
