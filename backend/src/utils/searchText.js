export function normalizeSearchText(value) {
  if (typeof value !== 'string') return '';
  const characters = Array.from(
    value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' '),
  );
  while (Buffer.byteLength(characters.join(''), 'utf8') > 700) characters.pop();
  return characters.join('');
}
