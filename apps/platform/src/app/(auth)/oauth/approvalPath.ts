/** The approval URL to return to after sign-in, preserving repeated query keys. */
export function approvalPath(
  path: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value]) {
      query.append(key, item);
    }
  }
  return `${path}${query.size ? `?${query.toString()}` : ""}`;
}
