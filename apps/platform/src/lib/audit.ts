export const AUDIT_SOURCES = [
  "platform",
  "qr",
  "manual_code",
  "airtable_form",
  "system",
] as const;

export type AuditSource = (typeof AUDIT_SOURCES)[number];

export function parseAuditSource(
  value: string | undefined,
): AuditSource | undefined {
  return AUDIT_SOURCES.find((source) => source === value);
}
