/**
 * A fingerprint, for showing that a value changed without showing the value.
 *
 * Length plus first and last character. Enough to tell "I pasted the wrong
 * token" from "the token rotated", and not enough to reconstruct anything. The
 * whole point of these commands is to move secrets without printing them, and a
 * diff that renders values would undo that in the one place people paste output
 * into a chat window.
 */
export function fingerprint(value: string): string {
  if (value === "") return "empty";
  // Short values would be largely reconstructable from first/last, so they get
  // no description at all.
  if (value.length <= 4) return `${value.length} chars`;
  return `${value.length} chars, ${value[0]}…${value[value.length - 1]}`;
}
