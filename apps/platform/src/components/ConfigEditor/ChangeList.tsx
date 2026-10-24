import "./configEditor.css";

import { COLLECTION_LABELS } from "~/server/config/editFields";
import { showValue, type ItemChange } from "~/server/config/edits";
import Badge from "~/ui/badge";

/**
 * The diff against the official config: one entry per meeting, workshop or
 * venue, each changed field with the official value above the proposed one.
 * Text only, so it reads the same in the browser and in a screen reader.
 */
export default function ChangeList({
  changes,
}: {
  changes: readonly ItemChange[];
}) {
  return (
    <ul className="cfg-changes">
      {changes.map((change) => (
        <li key={`${change.collection}:${change.key}`}>
          <div className="cfg-change-head">
            <b>
              {COLLECTION_LABELS[change.collection].singular} {change.key}
            </b>
            <Badge variant={change.kind === "added" ? "success" : "info"}>
              {change.kind === "added" ? "New" : "Changed"}
            </Badge>
          </div>
          <ul className="cfg-fields">
            {change.fields.map((field) => (
              <li key={field.field}>
                <span className="cfg-field-name">{field.label}</span>
                {change.kind === "changed" && (
                  <span className="cfg-before">{showValue(field.before)}</span>
                )}
                <span className="cfg-after">{showValue(field.after)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
