import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appJwt,
  GithubApiError,
  githubCall,
  installationToken,
  privateKeyDer,
} from "./githubApp";
import {
  fakeGithub,
  TEST_PRIVATE_KEY_PKCS1,
  TEST_PRIVATE_KEY_PKCS8,
  TEST_PUBLIC_KEY,
} from "./githubFake";

function verify(jwt: string): {
  header: unknown;
  claims: Record<string, number | string>;
} {
  const [head, claims, signature] = jwt.split(".") as [string, string, string];
  const ok = createVerify("RSA-SHA256")
    .update(`${head}.${claims}`)
    .verify(TEST_PUBLIC_KEY, Buffer.from(signature, "base64url"));
  expect(ok).toBe(true);
  return {
    header: JSON.parse(Buffer.from(head, "base64url").toString()),
    claims: JSON.parse(Buffer.from(claims, "base64url").toString()) as Record<
      string,
      number | string
    >,
  };
}

describe("appJwt", () => {
  it("signs an RS256 JWT a PKCS#8 key can be verified against", async () => {
    const jwt = await appJwt("123", TEST_PRIVATE_KEY_PKCS8, 1_700_000_000_000);
    const { header, claims } = verify(jwt);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims).toEqual({
      iat: 1_699_999_940,
      exp: 1_700_000_540,
      iss: "123",
    });
  });

  it("accepts the PKCS#1 key GitHub issues, by wrapping it", async () => {
    verify(await appJwt("123", TEST_PRIVATE_KEY_PKCS1));
  });

  it("accepts literal backslash-n sequences from an env value", async () => {
    verify(
      await appJwt("123", TEST_PRIVATE_KEY_PKCS1.trim().replace(/\n/g, "\\n")),
    );
  });

  it("wraps PKCS#1 into exactly the PKCS#8 node would write", () => {
    const pkcs8 = Buffer.from(
      TEST_PRIVATE_KEY_PKCS8.replace(/-----[^-]+-----|\s/g, ""),
      "base64",
    );
    expect(Buffer.from(privateKeyDer(TEST_PRIVATE_KEY_PKCS1))).toEqual(pkcs8);
  });

  it("refuses something that is not a PEM key", async () => {
    await expect(appJwt("1", "not a key")).rejects.toThrow(/not a PEM key/);
  });
});

describe("installationToken", () => {
  it("finds the installation on the repository and narrows the token to it", async () => {
    const github = fakeGithub();
    const token = await installationToken(
      { appId: "9", privateKey: TEST_PRIVATE_KEY_PKCS1 },
      { owner: "DevDogsUGA", name: "DevDogsUGA" },
      github.fetch,
    );
    expect(token).toBe("installation-token");
    expect(github.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /repos/DevDogsUGA/DevDogsUGA/installation",
      "POST /app/installations/7/access_tokens",
    ]);
    expect(github.calls[1]!.body).toEqual({ repositories: ["DevDogsUGA"] });
  });
});

describe("githubCall", () => {
  it("throws a GithubApiError carrying the status, without the response body", async () => {
    const github = fakeGithub();
    await expect(
      githubCall(github.fetch, "t", "/nowhere"),
    ).rejects.toMatchObject({ name: "GithubApiError", status: 404 });
    expect(GithubApiError.name).toBe("GithubApiError");
  });
});
