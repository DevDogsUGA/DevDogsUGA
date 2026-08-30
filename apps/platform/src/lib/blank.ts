/**
 * Treats an empty string as "absent": returns `undefined` when the value is
 * empty (or already nullish), otherwise the value unchanged. Use for optional
 * fields where `""` should be omitted rather than sent. This is the intent
 * behind the common `value || undefined` idiom, without the nullish-coalescing
 * footgun.
 */
export function emptyToUndefined(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

/**
 * Trims a string and returns `null` when the result is empty (or the input was
 * nullish), otherwise the trimmed string. Use for nullable text columns.
 */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return null;
  return trimmed;
}
