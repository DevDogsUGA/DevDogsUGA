import { describe, expect, it } from "vitest";
import { csvField, csvRow, csvStream, csvTimestamp } from "./csv";

/**
 * The format is a contract with importers nobody here controls, and every rule
 * fails silently rather than loudly: a missing quote shifts every subsequent
 * column, a bare timestamp is read in the importer's zone, and a null rendered
 * as the word "null" becomes a member named null.
 */

describe("csvField", () => {
  it("leaves an ordinary value unquoted", () => {
    // Quoting everything is also valid RFC 4180, and is what most hand-rolled
    // serializers do. Not quoting keeps the file readable in a terminal, which
    // is where somebody debugging an import will open it.
    expect(csvField("Sam Rivera")).toBe("Sam Rivera");
  });

  it("quotes on each of the four RFC 4180 triggers", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("line\rbreak")).toBe('"line\rbreak"');
  });

  it("renders null and undefined as empty, never as words", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("renders booleans as true/false", () => {
    expect(csvField(true)).toBe("true");
    expect(csvField(false)).toBe("false");
  });

  it("neutralises a spreadsheet formula in a team name", () => {
    // A member can name their team this. The tab is invisible in a cell and
    // stops the formula executing on open.
    // Not quoted: a tab is an ordinary character in a comma-delimited file,
    // and none of the four RFC 4180 triggers is present.
    expect(csvField("=cmd|'/c calc'!A1")).toBe("\t=cmd|'/c calc'!A1");
    expect(csvField("+1")).toBe("\t+1");
    expect(csvField("-1")).toBe("\t-1");
    expect(csvField("@here")).toBe("\t@here");
  });

  it("does not mangle a leading minus inside a normal value", () => {
    expect(csvField("well-known")).toBe("well-known");
  });

  it("renders a Date as an offset timestamp, not a bare local time", () => {
    // `csvStream`'s projection returns `unknown[]`, so nothing stops a caller
    // handing a Date straight over instead of routing it through csvTimestamp.
    // A bare `String(date)` writes "Fri Apr 10 2026 18:00:00 GMT-0400 (...)",
    // which is the exact thing csvTimestamp exists to keep out of a spreadsheet
    // opened in another zone.
    expect(csvField(new Date("2026-04-10T18:00:00-04:00"))).toBe(
      "2026-04-10T22:00:00.000Z",
    );
  });

  it("never writes [object Object]", () => {
    // The silent failure: "[object Object]" is a valid CSV cell that has
    // dropped the data, in a file nobody re-reads until an import has already
    // gone wrong. JSON is lossy for some shapes but always legible, so a
    // reviewer opening the file can see the projection is at fault.
    expect(csvField({ name: "Sam" })).toBe('"{""name"":""Sam""}"');
    expect(csvField([1, 2])).toBe('"[1,2]"');
  });
});

describe("csvRow", () => {
  it("joins with commas and ends CRLF", () => {
    expect(csvRow(["a", 1, true, null])).toBe("a,1,true,\r\n");
  });
});

describe("csvTimestamp", () => {
  it("emits ISO 8601 with an explicit offset", () => {
    // Never a bare local time: for a club whose meetings all start at 18:00
    // Eastern, an offsetless timestamp shows the wrong evening in another zone.
    expect(csvTimestamp(new Date("2026-04-10T18:00:00-04:00"))).toBe(
      "2026-04-10T22:00:00.000Z",
    );
  });

  it("renders null and an unparseable string as empty", () => {
    expect(csvTimestamp(null)).toBe("");
    expect(csvTimestamp("not a date")).toBe("");
  });
});

describe("csvStream", () => {
  async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    // `ignoreBOM: true` is required to SEE the BOM: the default TextDecoder
    // strips it, which would make the assertion below pass on a file that
    // never had one.
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      new Uint8Array(chunks.flatMap((c) => [...c])),
    );
  }

  async function* rows() {
    yield { name: "Sam", stars: 2 };
    yield { name: "Ada, R.", stars: 3 };
  }

  it("writes a BOM, a header and one line per row", async () => {
    const text = await collect(
      csvStream(["name", "stars"], rows(), (r) => [r.name, r.stars]),
    );

    // The BOM is not decoration: Excel on Windows reads a BOM-less UTF-8 CSV
    // as the system codepage, which turns non-ASCII surnames into mojibake.
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toBe('\uFEFFname,stars\r\nSam,2\r\n"Ada, R.",3\r\n');
  });

  it("surfaces an error from the row source rather than truncating", async () => {
    async function* failing() {
      yield { name: "Sam", stars: 1 };
      throw new Error("query failed");
    }

    await expect(
      collect(
        csvStream(["name", "stars"], failing(), (r) => [r.name, r.stars]),
      ),
    ).rejects.toThrow("query failed");
  });
});
