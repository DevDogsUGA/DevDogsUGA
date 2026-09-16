import { describe, expect, it } from "vitest";
import { isUgaEmail } from "./auth";

describe("isUgaEmail", () => {
  it.each(["student@uga.edu", "STUDENT@UGA.EDU"])(
    "accepts a UGA address: %s",
    (email) => expect(isUgaEmail(email)).toBe(true),
  );

  it.each([
    undefined,
    null,
    "student@gmail.com",
    "student@uga.edu.example.com",
    "@uga.edu",
  ])("rejects a non-UGA identity: %s", (email) => {
    expect(isUgaEmail(email)).toBe(false);
  });
});
