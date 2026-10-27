import "./graphics.css";

import type { ReactNode } from "react";
import { buttonVariants } from "~/ui/button";

/**
 * One rendition of one graphic: a lazy preview drawn by the image route at its
 * real aspect, its size, and a download. Nothing renders until the tile nears
 * the viewport (`loading="lazy"`), which is how a page of two dozen previews
 * costs the Worker only the cards somebody scrolls to.
 */
export default function GraphicTile({
  src,
  alt,
  name,
  width,
  height,
  select,
  filename,
}: {
  /** The image route's URL without `download`. */
  src: string;
  alt: string;
  /** The format's name, which is also the caption. */
  name: string;
  width: number;
  height: number;
  /** The ZIP checkbox, when this tile can be ticked. */
  select?: ReactNode;
  filename: string;
}) {
  const separator = src.includes("?") ? "&" : "?";

  return (
    <div className="gfx-tile">
      <div
        className="gfx-frame"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* A route-handler PNG that varies per request: next/image has nothing to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" />
      </div>
      <div className="gfx-cap">
        <span className="gfx-name">{name}</span>
        <span className="gfx-dims">
          {width} × {height}
        </span>
      </div>
      <div className="gfx-acts">
        {select}
        <a
          href={`${src}${separator}download=1`}
          download={filename}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Download
          <span className="sr-only"> {alt}</span>
        </a>
      </div>
    </div>
  );
}
