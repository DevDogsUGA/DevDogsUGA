import { describe, expect, it, vi } from "vitest";
import {
  looksLikeAccessToken,
  NoAccessTokenError,
  resolveToken,
  type TokenSources,
} from "./token.js";

/**
 * Where the token that unlocks all three projects comes from.
 *
 * The failure worth testing is not "it could not find one" — that throws and
 * says so. It is finding the WRONG one: authenticating as a different account
 * than the operator intended, which succeeds, reports nothing, and writes to a
 * project they were not looking at.
 */

function sources(over: Partial<TokenSources> = {}): TokenSources {
  return {
    fromVault: async () => undefined,
    prompt: async () => undefined,
    offerSave: async () => false,
    save: async () => {},
    ...over,
  };
}

describe("order of preference", () => {
  it("prefers the flag over everything, including the environment", () => {
    // Explicit beats ambient. Someone passing --access-token while
    // BWS_ACCESS_TOKEN is set is overriding on purpose, and quietly using the
    // environment would point the command at the account they were avoiding.
    return expect(
      resolveToken(
        sources({
          explicit: "flag-token",
          env: "env-token",
          fromVault: async () => "vault-token",
        }),
      ),
    ).resolves.toBe("flag-token");
  });

  it("prefers the environment over the vault", async () => {
    await expect(
      resolveToken(
        sources({ env: "env-token", fromVault: async () => "vault-token" }),
      ),
    ).resolves.toBe("env-token");
  });

  it("reads the vault when nothing else is set", async () => {
    await expect(
      resolveToken(sources({ fromVault: async () => "vault-token" })),
    ).resolves.toBe("vault-token");
  });

  it("asks only when the first three are empty", async () => {
    const prompt = vi.fn(async () => "typed-token");
    await expect(resolveToken(sources({ prompt }))).resolves.toBe(
      "typed-token",
    );
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("does not touch the vault when a token was already found", async () => {
    // Reading it can unlock a vault and prompt for a master password. Doing
    // that when the answer was already in hand is both slow and alarming.
    const fromVault = vi.fn(async () => "vault-token");
    await resolveToken(sources({ env: "env-token", fromVault }));
    expect(fromVault).not.toHaveBeenCalled();
  });
});

describe("saving what was typed", () => {
  it("offers to save a typed token, and saves on yes", async () => {
    const save = vi.fn(async () => {});
    await resolveToken(
      sources({
        prompt: async () => "typed-token",
        offerSave: async () => true,
        save,
      }),
    );
    expect(save).toHaveBeenCalledWith("typed-token");
  });

  it("does not save when declined", async () => {
    const save = vi.fn(async () => {});
    await resolveToken(
      sources({
        prompt: async () => "typed-token",
        offerSave: async () => false,
        save,
      }),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("never offers to save a token from the flag or the environment", async () => {
    // Copying a credential into a vault nobody asked to put it in is a
    // surprise, and on a shared machine it is somebody else's vault.
    const offerSave = vi.fn(async () => true);
    await resolveToken(sources({ env: "env-token", offerSave }));
    await resolveToken(sources({ explicit: "flag-token", offerSave }));
    expect(offerSave).not.toHaveBeenCalled();
  });

  it("never offers to save one that came back from the vault", async () => {
    const offerSave = vi.fn(async () => true);
    await resolveToken(
      sources({ fromVault: async () => "vault-token", offerSave }),
    );
    expect(offerSave).not.toHaveBeenCalled();
  });

  it("still returns the token when saving fails", async () => {
    // Somebody just pasted a live credential. Making them do it again because
    // a vault write failed is the worst possible moment to be strict, and the
    // command itself does not depend on the save having happened.
    await expect(
      resolveToken(
        sources({
          prompt: async () => "typed-token",
          offerSave: async () => true,
          save: async () => {
            throw new Error("vault is locked");
          },
        }),
      ),
    ).resolves.toBe("typed-token");
  });
});

describe("nothing anywhere", () => {
  it("throws something with a next step in it", async () => {
    await expect(resolveToken(sources())).rejects.toThrow(NoAccessTokenError);
    await expect(resolveToken(sources())).rejects.toThrow(/BWS_ACCESS_TOKEN/);
  });

  it("treats an empty string as absent, not as a token", async () => {
    // A cleared `export BWS_ACCESS_TOKEN=` is the realistic way this happens,
    // and passing "" onward authenticates as nobody with a confusing 401.
    await expect(
      resolveToken(sources({ explicit: "", env: "" })),
    ).rejects.toThrow(NoAccessTokenError);
  });
});

describe("reporting the source", () => {
  it("names where the token came from", async () => {
    const onSource = vi.fn();
    await resolveToken(sources({ env: "env-token", onSource }));
    expect(onSource).toHaveBeenCalledWith("environment");
  });

  it("announces the flag, so the argv warning can fire", async () => {
    const onSource = vi.fn();
    await resolveToken(sources({ explicit: "flag-token", onSource }));
    expect(onSource).toHaveBeenCalledWith("flag");
  });
});

describe("looksLikeAccessToken", () => {
  it("accepts the documented machine account shape", () => {
    expect(
      looksLikeAccessToken(
        "0.ec2c1d46-6a4b-4751-a310-af9601317f2d.C61AN57VFsn0O0YDRGRnfM8dKjKB:X8vbvA0bduihIDe/qrzIQQ==",
      ),
    ).toBe(true);
  });

  it("rejects the things people paste by mistake", () => {
    expect(looksLikeAccessToken("")).toBe(false);
    expect(looksLikeAccessToken("hunter2")).toBe(false);
    // A Password Manager item id, which is a bare UUID and easy to grab.
    expect(looksLikeAccessToken("ec2c1d46-6a4b-4751-a310-af9601317f2d")).toBe(
      false,
    );
  });

  it("tolerates surrounding whitespace from a paste", () => {
    expect(
      looksLikeAccessToken("  0.ec2c1d46-6a4b-4751-a310-af9601317f2d.abc\n"),
    ).toBe(true);
  });
});
