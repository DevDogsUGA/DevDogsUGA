import { alert } from "@devdogsuga/sdk/telemetry";

/**
 * The internal record behind an incident reference: one structured log line
 * and one Sentry alert, both carrying the reference the visitor was shown, so
 * a quoted `SI-…` finds them. Only the stage and the status or code are kept;
 * never a token, a code, or the provider's own message.
 */
export function reportSignInIncident(incident: {
  ref: string;
  stage: "provider_error" | "missing_code" | "code_exchange" | "profile_setup";
  code?: string | null;
  status?: number | null;
}): void {
  console.error(
    JSON.stringify({
      message: "Sign-in failed unexpectedly",
      incidentRef: incident.ref,
      stage: incident.stage,
      errorCode: incident.code ?? null,
      status: incident.status ?? null,
    }),
  );
  // Tagged so a quoted reference resolves through a tag search; the alert
  // itself never throws.
  alert(
    "Sign-in failed unexpectedly",
    [
      `Reference: ${incident.ref}`,
      `Stage: ${incident.stage}`,
      `Code: ${incident.code ?? "none"}`,
    ],
    { tags: { incidentRef: incident.ref, stage: incident.stage } },
  );
}
