import { describe, expect, it } from "vitest";
import {
  success,
  failure,
  isSuccess,
  expected,
  ExpectedFailure,
  type ActionResult,
} from "./actionResult";

describe("Action result", () => {
  it("constructs empty and populated successes", () => {
    expect(success()).toEqual({ ok: true });
    const result = success({ id: 1 }, "Saved.");
    expect(result).toEqual({ ok: true, data: { id: 1 }, message: "Saved." });
    if (isSuccess(result)) expect(result.data?.id).toBe(1);
  });
  it("keeps failure messages and field errors", () => {
    const result: ActionResult<number> = failure("Invalid", {
      name: "Required",
    });
    expect(isSuccess(result)).toBe(false);
    expect(result).toEqual({
      ok: false,
      message: "Invalid",
      fieldErrors: { name: "Required" },
    });
  });
});

it("wraps successful data and an optional success message", async () => {
  await expect(expected(async () => ({ id: 1 }), "Saved.")).resolves.toEqual(
    success({ id: 1 }, "Saved."),
  );
  await expect(expected(async () => undefined)).resolves.toEqual(success());
});
it("converts typed refusals with their message and field errors", async () => {
  const error = new ExpectedFailure("Reworded refusal", { name: "Required" });
  expect(error).toBeInstanceOf(Error);
  await expect(
    expected(async () => {
      throw error;
    }),
  ).resolves.toEqual(failure("Reworded refusal", { name: "Required" }));
  await expect(
    expected(async () => {
      throw new ExpectedFailure("Conflict");
    }),
  ).resolves.toEqual(failure("Conflict"));
});
it("rethrows errors and non-Error values unchanged", async () => {
  for (const error of [
    new Error("Conflict"),
    new TypeError("Bug"),
    "rejected",
    null,
  ]) {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Exercise unexpected non-Error rejections deliberately.
    const reject = () => Promise.reject<never>(error);
    await expect(expected(reject)).rejects.toBe(error);
  }
});
