/**
 * Action results cross the server/client boundary. Expected failures are returned;
 * only bugs escape. Domain code throws ExpectedFailure for refusals a user can
 * cause; actions wrap domain calls in expected(). Draft edits saved values with
 * Save/Discard and the save bar.
 * Command performs one action, with inline failure and a success toast; compose
 * Commands for multi-step decisions. Redirecting actions stay plain forms.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function success<T = undefined>(
  data?: T,
  message?: string,
): ActionResult<T> {
  return {
    ok: true,
    ...(data === undefined ? {} : { data }),
    ...(message === undefined ? {} : { message }),
  };
}

export function failure(
  message: string,
  fieldErrors?: Record<string, string>,
): Extract<ActionResult, { ok: false }> {
  return {
    ok: false,
    message,
    ...(fieldErrors === undefined ? {} : { fieldErrors }),
  };
}

/** Narrow an Action result to its successful branch. */
export function isSuccess<T>(
  result: ActionResult<T>,
): result is Extract<ActionResult<T>, { ok: true }> {
  return result.ok;
}

/** A refusal a user can cause, with optional errors for individual fields. */
export class ExpectedFailure extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ExpectedFailure";
  }
}

/** Actions translate domain refusals into results; unexpected errors still throw. */
export async function expected<T>(
  work: () => Promise<T>,
  message?: string,
): Promise<ActionResult<T>> {
  try {
    return success(await work(), message);
  } catch (error) {
    if (error instanceof ExpectedFailure)
      return failure(error.message, error.fieldErrors);
    throw error;
  }
}
