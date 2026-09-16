import { describe, expect, it } from "vitest";
import { parseNewsletterArgs } from "./commands.js";

const CWD = "/somewhere";

describe("parseNewsletterArgs", () => {
  it("defaults to both files, no push, the club mailbox", () => {
    const options = parseNewsletterArgs(["3.0.0"], CWD);
    if (options instanceof Error) throw options;
    expect(options.versions).toEqual(["3.0.0"]);
    expect(options.formats).toEqual(["eml", "html"]);
    expect(options.push).toBe(false);
    expect(options.mailbox).toBe("devdogs@uga.edu");
  });

  it("writes no files under --push unless asked to", () => {
    const options = parseNewsletterArgs(["3.0.0", "--push"], CWD);
    if (options instanceof Error) throw options;
    expect(options.push).toBe(true);
    expect(options.formats).toEqual([]);
  });

  it("lets --format and --push combine", () => {
    const options = parseNewsletterArgs(
      ["3.0.0", "--push", "--format", "html"],
      CWD,
    );
    if (options instanceof Error) throw options;
    expect(options.push).toBe(true);
    expect(options.formats).toEqual(["html"]);
  });

  it("refuses --send without recipients, and --to without --send", () => {
    expect(parseNewsletterArgs(["3.0.0", "--send"], CWD)).toBeInstanceOf(Error);
    expect(
      parseNewsletterArgs(["3.0.0", "--to", "a@uga.edu"], CWD),
    ).toBeInstanceOf(Error);
  });

  it("reads --to as a recipient list and writes no files under --send", () => {
    const options = parseNewsletterArgs(
      ["3.0.1", "--send", "--to", "a@uga.edu, b@uga.edu"],
      CWD,
    );
    if (options instanceof Error) throw options;
    expect(options.send).toBe(true);
    expect(options.to).toEqual(["a@uga.edu", "b@uga.edu"]);
    expect(options.formats).toEqual([]);
    expect(options.versions).toEqual(["3.0.1"]);
  });

  it("reads --mailbox as a value, never as a version", () => {
    const options = parseNewsletterArgs(
      ["--mailbox", "someone@uga.edu", "3.0.0"],
      CWD,
    );
    if (options instanceof Error) throw options;
    expect(options.mailbox).toBe("someone@uga.edu");
    expect(options.versions).toEqual(["3.0.0"]);
  });
});
