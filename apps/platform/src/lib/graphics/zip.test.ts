// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { crc32, zipStream, type ZipFile } from "./zip";

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function* from(files: ZipFile[]): AsyncGenerator<ZipFile> {
  for (const file of files) yield file;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zipStream", () => {
  it("produces an archive a real unzipper reads back byte for byte", async () => {
    const files: ZipFile[] = [
      { name: "a-og.png", data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1]) },
      { name: "b-instagram-story.png", data: new Uint8Array(70_000).fill(7) },
      { name: "empty.png", data: new Uint8Array() },
      { name: "café.png", data: Uint8Array.from([9, 9]) },
    ];
    const archive = await JSZip.loadAsync(
      await collect(zipStream(from(files))),
      {
        checkCRC32: true,
      },
    );

    expect(Object.keys(archive.files).sort()).toEqual(
      files.map((f) => f.name).sort(),
    );
    for (const file of files) {
      const read = await archive.file(file.name)!.async("uint8array");
      expect(Buffer.from(read).equals(Buffer.from(file.data)), file.name).toBe(
        true,
      );
    }
  });

  it("is a valid empty archive with no files", async () => {
    const bytes = await collect(zipStream(from([])));
    expect(bytes.length).toBe(22);
    expect(Object.keys((await JSZip.loadAsync(bytes)).files)).toEqual([]);
  });

  it("asks for the next file only when the previous one has been read", async () => {
    let produced = 0;
    async function* counting(): AsyncGenerator<ZipFile> {
      for (let i = 0; i < 5; i += 1) {
        produced += 1;
        yield { name: `${i}.png`, data: new Uint8Array(10) };
      }
    }
    const stream = zipStream(counting(), new Date("2026-10-23T12:00:00Z"));
    const reader = stream.getReader();
    await reader.read();
    // The stream's own queue holds at most one pull ahead.
    expect(produced).toBeLessThanOrEqual(2);
    await reader.cancel();
  });

  it("errors the stream when rendering fails instead of finishing a short archive", async () => {
    async function* failing(): AsyncGenerator<ZipFile> {
      yield { name: "ok.png", data: new Uint8Array(3) };
      throw new Error("render failed");
    }
    await expect(collect(zipStream(failing()))).rejects.toThrow(
      "render failed",
    );
  });
});
