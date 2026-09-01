/**
 * Satori reads `rgba()`; it does not read an 8-digit hex, and treats a colour
 * it cannot parse as transparent rather than as an error. So every translucent
 * value in these templates goes through here.
 */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);

  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
