import { isValidRedirectUri } from "./redirectRule";

const MAX_LABEL_LENGTH = 100;

export interface RegistrationParams {
  label: string;
  callbackUri: string;
}

export type RegistrationParamsResult =
  { ok: true; params: RegistrationParams } | { ok: false; error: string };

/**
 * The `label`/`callback_uri` validation shared by both `devtools oauth`
 * handoffs: the loopback connect flow's `~/server/oauth/connectParams` and
 * the device-code flow's `POST /tools/oauth/device/code`. Split out so
 * "what a valid label or callback URI looks like" is defined once instead
 * of copied between the two. The address rule is the one every client
 * shares (`./redirectRule`).
 */
export function parseRegistrationParams(raw: {
  label: string;
  callbackUri: string;
}): RegistrationParamsResult {
  const label = raw.label.trim();
  const callbackUri = raw.callbackUri;

  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    return {
      ok: false,
      error: `label must be between 1 and ${MAX_LABEL_LENGTH} characters.`,
    };
  }

  if (!isValidRedirectUri(callbackUri)) {
    return {
      ok: false,
      error:
        "callback_uri must be an https:// URL, or an http:// one only for localhost, 127.0.0.1 or [::1].",
    };
  }

  return { ok: true, params: { label, callbackUri } };
}
