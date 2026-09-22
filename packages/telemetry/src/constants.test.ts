import { describe, expect, it } from "vitest";
import { ERROR_SAMPLE_RATE, isService, tracesSampleRateFor } from "./constants.js";

describe("tracesSampleRateFor", () => {
  it("samples production at 0.2", () => {
    expect(tracesSampleRateFor("production")).toBe(0.2);
  });

  it("samples staging at 0.05", () => {
    expect(tracesSampleRateFor("staging")).toBe(0.05);
  });

  it("samples every other environment at 0", () => {
    expect(tracesSampleRateFor("development")).toBe(0);
    expect(tracesSampleRateFor("ci")).toBe(0);
    expect(tracesSampleRateFor("local")).toBe(0);
    expect(tracesSampleRateFor("something-unknown")).toBe(0);
  });
});

describe("isService", () => {
  it("accepts the four known services", () => {
    expect(isService("platform")).toBe(true);
    expect(isService("schedule-builder")).toBe(true);
    expect(isService("sandbox")).toBe(true);
    expect(isService("devtools")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isService("discord")).toBe(false);
    expect(isService("")).toBe(false);
  });
});

it("errors are always fully sampled", () => {
  expect(ERROR_SAMPLE_RATE).toBe(1);
});
