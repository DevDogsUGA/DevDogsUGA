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

/**
 * When a reflection's window opens (Q52): the later of the meeting's end and
 * the moment attendance was recorded, so an officer adding someone days after
 * the meeting still gives them a full window.
 */
export function reflectionWindowStart(
  meetingEndsAt: Date,
  attendanceRecordedAt: Date,
): Date {
  return attendanceRecordedAt > meetingEndsAt
    ? attendanceRecordedAt
    : meetingEndsAt;
}
