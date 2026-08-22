/**
 * `modal` is the `@modal` slot: empty (its `default.tsx`) until a link to
 * `/events/directions` is followed from a page under here, at which point the
 * slot's intercepting route renders the directions dialog over `children`
 * instead of the browser leaving the calendar for the full page.
 */
export default function EventsLayout({
  children,
  modal,
}: LayoutProps<"/events">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
