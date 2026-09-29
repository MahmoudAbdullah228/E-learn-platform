import { z } from 'zod';

const formattingCharacterPattern = /\p{Cf}/u;
const controlCharacterPattern = /\p{Cc}/u;

function containsUnsafeCharacter(value, multiline) {
  return [...value].some(character => {
    if (formattingCharacterPattern.test(character)) return true;
    if (!controlCharacterPattern.test(character)) return false;
    return !multiline || !['\t', '\n', '\r'].includes(character);
  });
}

export function textSchema({ field, minimum, maximum, multiline = false }) {
  return z.string().trim().min(minimum).max(maximum).refine(
    value => !containsUnsafeCharacter(value, multiline),
    { message: `${field} contains unsupported control or formatting characters` },
  );
}
