/**
 * A test account's display name, from its `auth.users` metadata.
 *
 * `addTestAccount` and `updateTestAccount` write it to both `full_name` and
 * `name`, the keys GoTrue's userinfo endpoint reports and the ones an OIDC
 * client reads. Accounts created before both were written may carry only
 * one of them, so either is accepted.
 */
export function testAccountName(metadata: unknown): string {
  if (metadata && typeof metadata === "object") {
    for (const key of ["full_name", "name"] as const) {
      const value = (metadata as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "Test User";
}
