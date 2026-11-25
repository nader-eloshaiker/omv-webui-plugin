// SPDX-License-Identifier: GPL-3.0-or-later
// The motion tokens as an element resolves them (design/tokens.css, foundation 7.1), for the Web
// Animations API. Read from the element, not from <html>, so a reduced scope's own tokens apply.

export type DurationToken =
  | "--duration-press"
  | "--duration-fast"
  | "--duration-base"
  | "--duration-slow"
  | "--duration-glide";

export type CurveToken =
  | "--ease-standard"
  | "--ease-enter"
  | "--ease-exit"
  | "--ease-settle"
  | "--ease-soft";

const DURATION_FALLBACK: Record<DurationToken, number> = {
  "--duration-press": 90,
  "--duration-fast": 160,
  "--duration-base": 240,
  "--duration-slow": 360,
  "--duration-glide": 640,
};

const CURVE_FALLBACK: Record<CurveToken, string> = {
  "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  "--ease-enter": "cubic-bezier(0.05, 0.7, 0.1, 1)",
  "--ease-exit": "cubic-bezier(0.3, 0, 0.8, 0.15)",
  "--ease-settle": "cubic-bezier(0.2, 0, 0, 1)",
  "--ease-soft": "cubic-bezier(0.2, 0, 0, 1)",
};

function read(element: Element | null, name: string): string {
  if (!element || typeof getComputedStyle !== "function") {
    return "";
  }
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/** A CSS time ("360ms", "0.36s") in milliseconds, or null for anything else. */
export function timeMs(value: string): number | null {
  const match = /^(-?[\d.]+)(ms|s)$/u.exec(value.trim());
  if (!match) {
    return null;
  }
  const n = Number(match[1]);
  return match[2] === "s" ? n * 1000 : n;
}

/** A duration token in milliseconds as `element` sees it; the token file's value when unreadable. */
export function durationAt(
  element: Element | null,
  name: DurationToken,
): number {
  return timeMs(read(element, name)) ?? DURATION_FALLBACK[name];
}

/** A curve token as `element` sees it (a `linear()` spring is passed through). */
export function curveAt(element: Element | null, name: CurveToken): string {
  const value = read(element, name);
  return value === "" ? CURVE_FALLBACK[name] : value;
}

/**
 * `element.animate`, or null where the Web Animations API is missing (a test). A curve the engine
 * cannot parse (an older engine and `linear()`) falls back to the standard curve rather than
 * throwing.
 */
export function animate(
  element: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (typeof (element as HTMLElement).animate !== "function") {
    return null;
  }
  try {
    return element.animate(frames, options);
  } catch {
    return element.animate(frames, {
      ...options,
      easing: CURVE_FALLBACK["--ease-standard"],
    });
  }
}

/** Resolves when `animation` ends, whether it finished or was cancelled. */
export function settled(animation: Animation | null): Promise<void> {
  if (!animation) {
    return Promise.resolve();
  }
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}
