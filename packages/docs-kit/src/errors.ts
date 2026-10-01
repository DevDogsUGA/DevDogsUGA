/**
 * The one error type every failing check in this package throws, so a
 * consumer (the CLI, a test) can tell "the content is wrong" apart from a
 * genuine bug in the compiler by catching this and nothing wider.
 *
 * Every message is written to stand alone in a terminal: which file, what was
 * wrong with it, said plainly enough that fixing it does not require reading
 * this source.
 */
export class DocsBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocsBuildError";
  }
}
