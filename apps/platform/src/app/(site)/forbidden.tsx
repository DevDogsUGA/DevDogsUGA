import ConsoleForbidden from "~/components/Content/ConsoleForbidden";

/** A `forbidden()` thrown inside any site page: the console's access-denied card, in the site chrome. */
export default function SiteForbidden() {
  return <ConsoleForbidden />;
}
