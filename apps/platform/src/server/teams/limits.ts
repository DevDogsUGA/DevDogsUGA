/**
 * The default competition roster cap.
 *
 * This was briefly a column on a singleton `platform."instance"` table, on the
 * reasoning that team size is a club decision rather than a constant. Nothing
 * ever wrote it: no console page exposed it, no script set it, and the one case
 * that genuinely needs a different cap, a competition run to different rules,
 * already has `competitions."maxTeamSize"` to override it per competition. A
 * configuration point with no way to configure it is a constant kept somewhere
 * harder to read, and it dragged a whole table along with it.
 *
 * Both consumers resolve the fallback from here, which matters more than where
 * the number lives: a page rendering a blank cap while the join action rejects
 * a fourth member is the drift this shared constant prevents.
 */
export const DEFAULT_MAX_TEAM_SIZE = 4;
