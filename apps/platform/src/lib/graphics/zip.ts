/**
 * A streaming ZIP writer, store-only.
 *
 * Why not JSZip, which the platform already ships: its generator builds the
 * whole archive before the first byte leaves, so a ZIP of two dozen PNGs would
 * hold every image AND the archive in a Worker's 128MB at once, and nothing
 * would reach the browser until the last card had rendered. Here an entry
 * is rendered, written and released before the next one starts.
 *
 * Store (no compression) is the right method for this payload: a PNG is
 * already deflated, so compressing it again costs CPU, which is the scarce
 * thing on a Worker, and saves nothing.
 *
 * Every entry's size and CRC are known before its header is written (the PNG is
 * a finished buffer), so no data descriptors are needed. Neither ZIP64: an
 * archive here is far under 4GB and 65,535 entries.
 */

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what a ZIP header stores. */
function dosDateTime(at: Date): { date: number; time: number } {
  const year = Math.max(1980, at.getUTCFullYear());

  return {
    date:
      ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
    time:
      (at.getUTCHours() << 11) |
      (at.getUTCMinutes() << 5) |
      Math.floor(at.getUTCSeconds() / 2),
  };
}

const encoder = new TextEncoder();
/** Bit 11: the filename is UTF-8. */
const UTF8 = 0x0800;
const VERSION = 20;

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

function localHeader(
  entry: CentralEntry,
  stamp: { date: number; time: number },
): Uint8Array {
  const out = new Uint8Array(30 + entry.name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, UTF8, true);
  view.setUint16(8, 0, true); // stored
  view.setUint16(10, stamp.time, true);
  view.setUint16(12, stamp.date, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.size, true);
  view.setUint32(22, entry.size, true);
  view.setUint16(26, entry.name.length, true);
  view.setUint16(28, 0, true);
  out.set(entry.name, 30);

  return out;
}

function centralDirectory(
  entries: readonly CentralEntry[],
  stamp: { date: number; time: number },
  offset: number,
): Uint8Array {
  const size = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(size + 22);
  const view = new DataView(out.buffer);
  let at = 0;

  for (const entry of entries) {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, VERSION, true);
    view.setUint16(at + 8, UTF8, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, stamp.time, true);
    view.setUint16(at + 14, stamp.date, true);
    view.setUint32(at + 16, entry.crc, true);
    view.setUint32(at + 20, entry.size, true);
    view.setUint32(at + 24, entry.size, true);
    view.setUint16(at + 28, entry.name.length, true);
    view.setUint32(at + 42, entry.offset, true);
    out.set(entry.name, at + 46);
    at += 46 + entry.name.length;
  }

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, size, true);
  view.setUint32(at + 16, offset, true);

  return out;
}

/**
 * The archive as a stream, pulling one entry from `files` per read.
 *
 * Backpressure is the point: the next file is only requested once the consumer
 * has drained the last, so a slow client never has more than one rendered image
 * in memory. A failure in `files` errors the stream, which aborts the download
 * rather than delivering a corrupt-but-complete-looking ZIP.
 */
export function zipStream(
  files: AsyncIterable<ZipFile>,
  now: Date = new Date(),
): ReadableStream<Uint8Array> {
  const iterator = files[Symbol.asyncIterator]();
  const stamp = dosDateTime(now);
  const entries: CentralEntry[] = [];
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();

      if (next.done) {
        controller.enqueue(centralDirectory(entries, stamp, offset));
        controller.close();
        return;
      }

      const { name, data } = next.value;
      const entry: CentralEntry = {
        name: encoder.encode(name),
        crc: crc32(data),
        size: data.length,
        offset,
      };
      const header = localHeader(entry, stamp);
      entries.push(entry);
      offset += header.length + data.length;
      controller.enqueue(header);
      controller.enqueue(data);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}
