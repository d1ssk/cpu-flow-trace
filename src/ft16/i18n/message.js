/** Default formatter for explanations outside a localized view (including tests). */
export function message(text, ...values) {
  if (!values.length) return String(text);
  return String(text).replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}
