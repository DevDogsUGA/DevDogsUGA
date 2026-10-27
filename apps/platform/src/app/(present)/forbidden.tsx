import ConsoleForbidden from "~/components/Content/ConsoleForbidden";

/** The presenter view's `forbidden()`: the same card, on the presenter ground. */
export default function PresentForbidden() {
  return (
    <div className="cosmic h-full overflow-auto">
      <ConsoleForbidden />
    </div>
  );
}
