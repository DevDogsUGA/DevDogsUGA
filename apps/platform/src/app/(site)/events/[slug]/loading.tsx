/**
 * What appears between the click and the meeting arriving.
 *
 * Not a nicety: the `(site)` layout reads auth cookies, so every route under
 * it is dynamic, and a dynamic route is not prefetched at all unless it has a
 * loading boundary. Without this file, hovering a meeting link fetches
 * nothing, and the dialog opens on an empty frame while the query runs.
 *
 * Shaped like the body it stands in for — badge row, a line of prose, the
 * location, two agenda rows — so the dialog does not resize under the reader
 * the moment the real content lands.
 */
export default function Loading() {
  return (
    <div aria-busy className="flex animate-pulse flex-col gap-4">
      <div aria-hidden className="flex gap-2">
        <div className="h-5 w-20 rounded-sm bg-mauve-200" />
        <div className="h-5 w-24 rounded-sm bg-mauve-200" />
      </div>
      <div aria-hidden className="h-4 w-40 rounded-sm bg-mauve-200" />
      <div aria-hidden className="h-4 w-2/3 rounded-sm bg-mauve-200" />
      <div aria-hidden className="flex flex-col gap-2">
        <div className="h-14 rounded-sm border-2 border-black bg-white" />
        <div className="h-14 rounded-sm border-2 border-black bg-white" />
      </div>
    </div>
  );
}
