import { generateKeyPairSync } from "node:crypto";
import { getAuthoredFiles } from "@devdogsuga/events";
import { formatJson } from "./formatJson";

/**
 * A stand-in for GitHub's REST API, for tests only. It answers the handful of
 * calls the config-PR flow makes from memory and records every request, so a
 * test can assert what was written (and that nothing was, when a proposal is
 * refused). Nothing here reaches the network.
 */

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

const KEYS = generateKeyPairSync("rsa", { modulusLength: 2048 });

/** A PKCS#1 PEM, the format GitHub issues. */
export const TEST_PRIVATE_KEY_PKCS1 = KEYS.privateKey
  .export({ type: "pkcs1", format: "pem" })
  .toString();
/** The same key as PKCS#8. */
export const TEST_PRIVATE_KEY_PKCS8 = KEYS.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
export const TEST_PUBLIC_KEY = KEYS.publicKey;

export const BASE_FILE_NAMES = [
  "meetings",
  "workshops",
  "venues",
  "series",
  "questions",
] as const;

/** The committed config as the files on the base branch would hold it. */
export function committedTexts(): Record<
  (typeof BASE_FILE_NAMES)[number],
  string
> {
  const files = getAuthoredFiles() as unknown as Record<string, unknown>;
  return Object.fromEntries(
    BASE_FILE_NAMES.map((name) => [name, formatJson(files[name])]),
  ) as Record<(typeof BASE_FILE_NAMES)[number], string>;
}

export function fakeGithub(
  options: {
    texts?: Partial<Record<(typeof BASE_FILE_NAMES)[number], string>>;
    /** Answer this request (`METHOD /path`) with a 500. */
    failOn?: string;
  } = {},
) {
  const calls: RecordedCall[] = [];
  const texts = { ...committedTexts(), ...options.texts };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const method = init?.method ?? "GET";
    const path = `${url.pathname}${url.search}`;
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${url.pathname}`;
    if (options.failOn && key === options.failOn) return json({}, 500);

    const prefix = "/repos/DevDogsUGA/DevDogsUGA";
    if (key === `GET ${prefix}/installation`) return json({ id: 7 });
    if (key === "POST /app/installations/7/access_tokens") {
      return json({ token: "installation-token" });
    }
    if (key === `GET ${prefix}`) return json({ default_branch: "main" });
    if (key === `GET ${prefix}/git/ref/heads/main`) {
      return json({ object: { sha: "basesha" } });
    }
    if (key === `GET ${prefix}/git/commits/basesha`) {
      return json({ tree: { sha: "basetree" } });
    }
    const file = /\/contents\/packages\/events\/src\/data\/(\w+)\.json$/.exec(
      url.pathname,
    );
    if (method === "GET" && file) {
      return new Response(texts[file[1] as keyof typeof texts], {
        status: 200,
      });
    }
    if (key === `POST ${prefix}/git/trees`) return json({ sha: "newtree" });
    if (key === `POST ${prefix}/git/commits`) return json({ sha: "newcommit" });
    if (key === `POST ${prefix}/git/refs`) return json({}, 201);
    if (key === `POST ${prefix}/pulls`) {
      return json(
        {
          html_url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/42",
          number: 42,
        },
        201,
      );
    }
    if (key === `POST ${prefix}/labels`) return json({}, 201);
    if (key === `POST ${prefix}/issues/42/labels`) return json([], 200);
    return json({ message: `unexpected ${key}` }, 404);
  }) as typeof fetch;

  return {
    fetch: fakeFetch,
    calls,
    /** Requests that change something on GitHub. */
    writes: () =>
      calls.filter(
        (c) => c.method !== "GET" && !c.path.includes("access_tokens"),
      ),
  };
}
