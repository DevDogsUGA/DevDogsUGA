/** Headers for a PNG the console serves, inline or as a download. */
export function pngResponse(
  bytes: Uint8Array,
  filename: string,
  download: boolean,
): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": "image/png",
      "content-length": String(bytes.length),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // Officer-only art for a meeting that can still be edited: never shared.
      "cache-control": "private, max-age=60",
    },
  });
}

export function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}
