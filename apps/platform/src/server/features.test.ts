import { afterEach, describe, expect, it, vi } from "vitest";
import { publicProfilesEnabled } from "./features";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicProfilesEnabled", () => {
  it("is off in production only", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    expect(publicProfilesEnabled()).toBe(false);
    vi.stubEnv("DEPLOY_ENV", "staging");
    expect(publicProfilesEnabled()).toBe(true);
    vi.stubEnv("DEPLOY_ENV", "development");
    expect(publicProfilesEnabled()).toBe(true);
  });
});
