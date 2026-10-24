/**
 * The sign-in sheet reader lives in `@devdogsuga/events/imports`, shared with
 * the console. This wrapper only turns its input errors into the CLI's
 * usage errors, which print without a stack.
 */
import { UsageError } from "@devdogsuga/cli-core/ui";
import {
  ImportInputError,
  MissingColumnsError,
  parseSheet as parseSharedSheet,
  type ParsedSheet,
  type SheetOptions,
} from "@devdogsuga/events/imports";

export type {
  Attendee,
  ParsedSheet,
  SheetOptions,
} from "@devdogsuga/events/imports";

export function parseSheet(
  text: string,
  options: SheetOptions = {},
): ParsedSheet {
  try {
    return parseSharedSheet(text, options);
  } catch (err) {
    if (err instanceof MissingColumnsError) {
      throw new UsageError(`${err.message} Name it with --email-column.`);
    }
    if (err instanceof ImportInputError) throw new UsageError(err.message);
    throw err;
  }
}
