const UGA_EMAIL_SUFFIX = "@uga.edu";

/** Whether an OAuth identity belongs to UGA's Google Workspace domain. */
export function isUgaEmail(email: string | null | undefined): boolean {
  return (
    email !== null &&
    email !== undefined &&
    email.length > UGA_EMAIL_SUFFIX.length &&
    email.toLowerCase().endsWith(UGA_EMAIL_SUFFIX)
  );
}
