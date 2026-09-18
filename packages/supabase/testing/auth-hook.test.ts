import { afterEach, describe, expect, it } from "vitest";
import { admin, anon } from "./personas";

const createdUserIds: string[] = [];

afterEach(async () => {
  const client = admin();
  while (createdUserIds.length > 0) {
    await client.auth.admin.deleteUser(createdUserIds.pop()!);
  }
});

describe("before-user-created email hook", () => {
  it("rejects an ordinary non-UGA account", async () => {
    const { data, error } = await anon().auth.signUp({
      email: `outside-${crypto.randomUUID()}@example.com`,
      password: "auth-hook-test-password",
    });

    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toContain(
      "Sign in with your uga.edu email address.",
    );
  });

  it("accepts uga.edu case-insensitively", async () => {
    const { data, error } = await anon().auth.signUp({
      email: `HOOK-${crypto.randomUUID()}@UGA.EDU`,
      password: "auth-hook-test-password",
    });

    expect(error).toBeNull();
    expect(data.user?.email).toMatch(/@uga\.edu$/i);
    createdUserIds.push(data.user!.id);
  });
});
