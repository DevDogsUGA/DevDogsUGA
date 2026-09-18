import type { ScheduleRule } from "../rule";
import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";

const EARTH_RADIUS_MILES = 3960;
const WALKING_SPEED_MPH = 3;

/**
 * Dormant distance/walking score rule. Reads building coordinates from the
 * Section/Meeting domain model but contributes no hard constraints — the old
 * hard walking requirement is removed entirely.
 *
 * Reactivation path: once building geocoding populates lat/lon on the
 * BuildingLocation seam, flip isActive() to check a user-facing constraint
 * (when one is added to GenerationConstraints).
 */
export const distance: ScheduleRule = {
  /**
   * Permanently dormant, regardless of any constraint flag. There is no
   * user-facing walking toggle in the current GenerationConstraints.
   *
   * To reactivate: (1) add a walking flag to GenerationConstraints,
   * (2) change this to `return ctx.walking ?? false`, and (3) add an
   * allowPartialSchedule or allowSchedule hook to enforce the constraint.
   */
  isActive: () => false,

  /**
   * Dormant score reading `meeting.building.lat/lon` across all meetings.
   * Handles null coordinates gracefully: when either meeting has no location,
   * contributes 0 walking time (unknown locations don't penalize scoring).
   *
   * Returns 0..1, where 1 = buildings are very close (score higher for closer
   * buildings). Inverts normalized max distance: (1 - normalized(maxDistance))
   * with a 30-minute walking window as the normalization bound.
   */
  score(complete: Section[], _ctx: GenerationConstraints): number {
    let maxDistance = 0;

    // Iterate through all meetings in all sections to find the longest walk
    for (const section of complete) {
      const meetings = section.meetings;
      for (let i = 0; i < meetings.length - 1; i++) {
        const a = meetings[i]!;
        const b = meetings[i + 1]!;

        const minutes = walkingMinutes(a.building, b.building);
        if (minutes > maxDistance) {
          maxDistance = minutes;
        }
      }
    }

    // Normalize: 30 minutes is the "far" threshold. Closer buildings score higher.
    return normalizeDistance(maxDistance);
  },
};

/**
 * Haversine walking time in minutes between two buildings. Returns 0 when
 * either building has no coordinates, so an unknown location never scores
 * worse than a measured one.
 */
function walkingMinutes(
  a: { lat: number | null; lon: number | null } | null,
  b: { lat: number | null; lon: number | null } | null,
): number {
  // Handle null buildings gracefully
  if (!a || !b) return 0;

  // Handle null coordinates gracefully
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) {
    return 0;
  }

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const haversine =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);

  const distanceMiles =
    EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(haversine));
  return distanceMiles * (60 / WALKING_SPEED_MPH);
}

/**
 * Convert degrees to radians.
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Normalize max distance to 0..1 score. Uses 30 minutes as the "far" bound:
 * - 0 minutes (same building) = 1.0 (best score)
 * - 30 minutes (far walk) = 0.0 (worst score)
 * - Beyond 30 minutes = clamped to 0.0
 */
function normalizeDistance(maxDistanceMinutes: number): number {
  const MAX_ACCEPTABLE_WALK_MINUTES = 30;

  if (maxDistanceMinutes <= 0) {
    return 1.0; // No walking needed
  }
  if (maxDistanceMinutes >= MAX_ACCEPTABLE_WALK_MINUTES) {
    return 0.0; // Far walk
  }

  // Linear interpolation: closer is better
  return (
    (MAX_ACCEPTABLE_WALK_MINUTES - maxDistanceMinutes) /
    MAX_ACCEPTABLE_WALK_MINUTES
  );
}
