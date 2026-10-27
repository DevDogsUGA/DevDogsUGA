// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "~/lib/imports";
import { readUpload } from "./upload";

const MEETING = "00000000-0000-4000-8000-000000000001";

/** A real multipart request, with the Content-Length a browser would send. */
async function request(
  form: FormData,
  headers: Record<string, string> = {},
): Promise<Request> {
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return new Request("http://localhost/console/data/imports/preview", {
    method: "POST",
    body,
    headers: {
      "content-type": encoded.headers.get("content-type")!,
      "content-length": String(body.byteLength),
      ...headers,
    },
  });
}

function form(file: File | null, fields: Record<string, string> = {}) {
  const f = new FormData();
  if (file) f.set("file", file);
  f.set("kind", "attendance");
  f.set("meetingId", MEETING);
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("readUpload", () => {
  it("reads a CSV and its fields", async () => {
    const res = await readUpload(
      await request(
        form(new File(["a,b\n"], "sheet.csv", { type: "text/csv" }), {
          mode: "replace",
          mapping: JSON.stringify({ email: "Mail" }),
        }),
      ),
    );
    expect(res).toMatchObject({
      ok: true,
      request: {
        kind: "attendance",
        mode: "replace",
        fileName: "sheet.csv",
        text: "a,b\n",
        mapping: { email: "Mail" },
        meetingId: MEETING,
      },
      confirmation: null,
    });
  });

  it("carries a confirmation's fingerprint and acknowledgement", async () => {
    const fingerprint = "a".repeat(64);
    const res = await readUpload(
      await request(
        form(new File(["x"], "a.csv"), { fingerprint, skipInvalid: "true" }),
      ),
    );
    expect(res).toMatchObject({
      ok: true,
      confirmation: { fingerprint, skipInvalid: true },
    });
  });

  it("refuses by declared length before reading the body", async () => {
    const res = await readUpload(
      await request(form(new File(["x"], "a.csv")), {
        "content-length": String(MAX_UPLOAD_BYTES + 200_000),
      }),
    );
    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses a file over the cap even when the declared length is small", async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.csv");
    const res = await readUpload(await request(form(big)));
    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it("accepts a file exactly at the cap", async () => {
    const edge = new File([new Uint8Array(MAX_UPLOAD_BYTES)], "edge.csv");
    const res = await readUpload(await request(form(edge)));
    expect(res.ok).toBe(true);
  });

  it("refuses a missing length, a missing file and non-CSV", async () => {
    const noLength = new Request("http://localhost/x", {
      method: "POST",
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("x"));
          c.close();
        },
      }),
      // @ts-expect-error duplex is required by undici for streamed bodies
      duplex: "half",
    });
    expect(await readUpload(noLength)).toMatchObject({
      ok: false,
      status: 411,
    });
    expect(await readUpload(await request(form(null)))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await readUpload(await request(form(new File(["x"], "sheet.xlsx")))),
    ).toMatchObject({ ok: false, status: 415 });
  });

  it("refuses unknown kinds, bad ids and bad mapping JSON", async () => {
    const file = () => new File(["x"], "a.csv");
    expect(
      await readUpload(await request(form(file(), { kind: "everything" }))),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await readUpload(await request(form(file(), { meetingId: "nope" }))),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await readUpload(await request(form(file(), { mapping: "{" }))),
    ).toMatchObject({ ok: false, status: 400 });
  });
});
