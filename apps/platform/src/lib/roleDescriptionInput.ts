/** Keeps forbidden characters out of the controlled field's state. */
export function acceptRoleDescriptionInput(current: string, next: string) {
  return /\r|\n|\s{2,}/u.test(next) ? current : next;
}
