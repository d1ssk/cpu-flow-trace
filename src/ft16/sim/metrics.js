/* Text metrics shared by the builder (which sizes every module box to its
 * contents) and the SVG renderer (which places and clips the text). All
 * diagram text uses a monospace font, so a width is characters × advance. */

export const FONT_FAMILY = 'Menlo, "SF Mono", SFMono-Regular, Consolas, "DejaVu Sans Mono", monospace';
export const FONT = { port: 8.5, title: 11, row: 10.5, big: 12.5, small: 8.5, front: 9 };
export const ADVANCE = 0.62; // em; slightly above Menlo's 0.602 for safety
export const charWidth = kind => FONT[kind] * ADVANCE;
export const LINE = { row: 13, big: 16, small: 11 };

export const textWidth = (chars, kind = 'row') => Math.ceil(chars * charWidth(kind));

/* Value text shown next to a terminal: H/L for one bit, hex otherwise. */
export const valueChars = width => (width === 1 ? 1 : 2 + Math.ceil(width / 4));
/* A terminal label is its name plus its value. One-bit terminals on the top
 * or bottom edge show only the name: the wire colour already shows H/L. */
export const showsValue = port => !(port.width === 1 && (port.side === 'top' || port.side === 'bottom'));
export const portLabelChars = port => (port.noLabel ? 0 : port.name.replace(/^i_/, '').length + (showsValue(port) ? 1 + valueChars(port.width) : 0));

const SPECIAL = {
  leds: n => ({ w: n * 18, h: 22 }),
  switches: n => ({ w: n * 18, h: 24 }),
  states: n => ({ w: n * 52 - 4, h: 22 }),
  map: () => ({ w: 16 * 8, h: 36 }),
};

/* Row templates → content box {w, h} in px. A template is
 * {chars, cls} for text, or {kind, n} for drawn rows. */
export function contentBox(rows = []) {
  let w = 0, h = 0;
  for (const r of rows) {
    if (r.kind && SPECIAL[r.kind]) {
      const s = SPECIAL[r.kind](r.n ?? 8);
      w = Math.max(w, s.w); h += s.h;
      continue;
    }
    const kind = rowKind(r.cls);
    w = Math.max(w, textWidth(r.chars ?? 0, kind));
    h += LINE[kind];
  }
  return { w, h };
}

export function rowKind(cls = '') {
  if (cls.includes('big')) return 'big';
  if (cls.includes('small')) return 'small';
  return 'row';
}

/* Helpers for module definitions. */
export const T = (chars, cls = '') => ({ chars, cls });
export const lines = (n, chars, cls = '') => Array.from({ length: n }, () => T(chars, cls));
