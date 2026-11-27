/**
 * One folder/id slug rule for the whole plugin.
 *
 * Root cause of "two courses ended up in different folders for the same
 * topic": the learner id and the roadmap id were slugged by two copies of the
 * same regex, so a tweak to one (e.g. keeping CJK characters) silently made the
 * two disagree. Both call sites now share this single implementation.
 */
export function slug(text, fallback = 'item', max = 40) {
  const out = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return out || fallback;
}
