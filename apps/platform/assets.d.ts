/**
 * Next's own `*.svg` declaration (next/image-types/global) types SVG imports
 * as `any`, since a project might route them through SVGR. Ours go through
 * `next/image` like any other static asset, so this narrower pattern, which
 * TypeScript prefers over the shorter `*.svg`, gives them their real type
 * and keeps `no-unsafe-assignment` quiet at `<Image src={...}>`.
 */
declare module "~/assets/*.svg" {
  import type { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
