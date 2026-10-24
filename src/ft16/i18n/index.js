import english from './en.json' with { type: 'json' };
import { message } from './message.js';

/** A translator belongs to one view; translation does not alter circuit logic or assembly. */
export function createTranslator(locale = 'ja') {
  if (locale !== 'en') return message;
  const lookup = text => Object.hasOwn(english, text) ? english[text] : text;
  const t = (text, ...values) => message(lookup(String(text)), ...values.map(value => typeof value === 'string' ? lookup(value) : value));
  return t;
}

/** Translate authored content only; assembly and machine state must remain byte-for-byte intact.
 * @template T
 * @param {T} data
 * @param {string} locale
 * @returns {T}
 */
export function localizeData(data, locale) {
  if (locale !== 'en') return data;
  const t = createTranslator(locale);
  const visit = value => {
    if (typeof value === 'string') return t(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, ['source', 'initialState', 'options', 'expected'].includes(key) ? entry : visit(entry)]));
    return value;
  };
  return visit(data);
}

/** Localize the static workspace once, before attaching listeners and rendering the circuit. */
export function translateMarkup(root, locale) {
  if (locale !== 'en') return;
  const t = createTranslator(locale);
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent;
    const trimmed = text.trim();
    if (trimmed) node.textContent = text.replace(trimmed, () => t(trimmed));
  }
  for (const element of root.querySelectorAll('*')) {
    for (const attr of ['aria-label', 'title', 'label']) {
      if (element.hasAttribute(attr)) element.setAttribute(attr, t(element.getAttribute(attr)));
    }
  }
}
