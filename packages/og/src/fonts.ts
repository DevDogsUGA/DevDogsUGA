import { EMBEDDED_FONTS } from "./generated/fonts.js";

/** A face in the shape Satori (and so `ImageResponse`) wants it. */
export interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700 | 800;
  style: "normal";
}

/**
 * Decodes the embedded faces.
 *
 * `atob` rather than `Buffer`, because this runs in a Cloudflare Worker as
 * often as it runs in Node and only one of the two has `Buffer`. It is a global
 * in both.
 *
 * The result is cached: a Worker isolate serves many requests, and three fonts
 * is about 200 KB of base64 to walk. Decoding it per render would be the most
 * expensive thing an OG response does.
 */
let cache: LoadedFont[] | undefined;

export function loadFonts(): LoadedFont[] {
  cache ??= EMBEDDED_FONTS.map((font) => {
    const binary = atob(font.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    return {
      name: font.name,
      data: bytes.buffer,
      weight: font.weight,
      style: font.style,
    };
  });

  return cache;
}
