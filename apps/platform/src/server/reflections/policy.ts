export function reflectionWordCount(content: string): number {
  const normalized = content.trim();
  return normalized === "" ? 0 : normalized.split(/\s+/u).length;
}

export function reflectionDeadline(
  activityEndsAt: Date,
  submissionWindowDays: number,
): Date {
  return new Date(
    activityEndsAt.getTime() + submissionWindowDays * 24 * 60 * 60 * 1000,
  );
}
