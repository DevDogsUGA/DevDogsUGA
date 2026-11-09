/** What a member types to confirm deleting their own account. */
export const DELETE_PHRASE = "delete my account";

/** What an officer types to confirm scheduling a member's deletion. */
export const OFFICER_DELETE_PHRASE = "delete";

/** Case and surrounding space are forgiven; the words are not. */
export function confirmationMatches(typed: string, phrase: string): boolean {
  return typed.trim().toLowerCase() === phrase;
}
