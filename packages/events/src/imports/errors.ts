/**
 * A file the import cannot read: no header row, a column that does not exist.
 * The message is written for the person who picked the file, so the CLI shows
 * it as a usage error and the console prints it beside the upload.
 */
export class ImportInputError extends Error {
  override name = "ImportInputError";
}

/** No column could be read as a required field: the caller may offer a picker. */
export class MissingColumnsError extends ImportInputError {
  override name = "MissingColumnsError";
}
