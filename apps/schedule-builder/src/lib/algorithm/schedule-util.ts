import type {
  AlgorithmSection,
  DayOfWeek,
  HConstraints,
  SConstraints,
} from "./types";
import { type Schedule } from "./schedule";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function normalizeValue(value: number, min: number, max: number): number {
  if (value < min) return 0;
  if (value > max) return 1;
  return (value - min) / (max - min);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns true when the schedule has no time conflicts on any day. */
export function validate(schedule: Schedule): boolean {
  for (const classes of schedule.days.values()) {
    for (let i = 0; i < classes.length - 1; i++) {
      const curr = classes[i]!;
      const next = classes[i + 1]!;
      if (timeToMinutes(curr.endTime) > timeToMinutes(next.startTime)) {
        return false;
      }
    }
  }
  return true;
}

export function validateHard(
  schedule: Schedule,
  constraints: HConstraints,
): void {
  if (!schedule || !constraints) {
    throw new Error("Schedule and/or constraints cannot be null");
  }
}

// ─── Objective components ─────────────────────────────────────────────────────

export function computeAverageProfessorQuality(schedule: Schedule): number {
  let sum = 0;
  let count = schedule.sections.length;
  for (const section of schedule.sections) {
    if (!section.professor.quality) {
      count--;
    } else {
      sum += section.professor.quality;
    }
  }
  return count === 0 ? 0 : sum / count;
}

/** Haversine distance in walking minutes between consecutive classes in a day. */
export function computeMaxDistance(schedule: Schedule): number {
  const EARTH_RADIUS_MILES = 3960;
  const WALKING_SPEED_MPH = 3;

  let maxDistance = 0;

  for (const classes of schedule.days.values()) {
    for (let i = 0; i < classes.length - 1; i++) {
      const a = classes[i]!;
      const b = classes[i + 1]!;

      if (
        a.latitude == null ||
        a.longitude == null ||
        b.latitude == null ||
        b.longitude == null
      ) {
        continue;
      }

      const dLat = toRad(b.latitude - a.latitude);
      const dLon = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);

      const haversine =
        Math.pow(Math.sin(dLat / 2), 2) +
        Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);

      const distanceMiles =
        EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(haversine));
      const walkingMinutes = distanceMiles * (60 / WALKING_SPEED_MPH);

      if (walkingMinutes > maxDistance) maxDistance = walkingMinutes;
    }
  }

  return maxDistance;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function computeAverageIdleTime(schedule: Schedule): number {
  let totalGap = 0;
  let gapCount = 0;

  for (const classes of schedule.days.values()) {
    let prevEnd = -1;
    for (const cls of classes) {
      const start = timeToMinutes(cls.startTime);
      const end = timeToMinutes(cls.endTime);
      if (prevEnd !== -1 && start >= prevEnd) {
        totalGap += start - prevEnd;
        gapCount++;
      }
      prevEnd = end;
    }
  }

  return gapCount === 0 ? 0 : totalGap / gapCount;
}

export function computeStartTime(schedule: Schedule): number {
  let earliest = 23 * 60 + 59;
  for (const section of schedule.sections) {
    for (const cls of section.classes) {
      const t = timeToMinutes(cls.startTime);
      if (t < earliest) earliest = t;
    }
  }
  return earliest / 60;
}

function computeEndTime(schedule: Schedule): number {
  let latest = 0;
  for (const section of schedule.sections) {
    for (const cls of section.classes) {
      const t = timeToMinutes(cls.startTime);
      if (t > latest) latest = t;
    }
  }
  return latest / 60;
}

function computeGapDay(schedule: Schedule, gapDay: DayOfWeek): boolean {
  return (schedule.days.get(gapDay) ?? []).length === 0;
}

// ─── Overall objectives ───────────────────────────────────────────────────────

export function computeOverallObjective(schedule: Schedule): number {
  return (
    normalizeValue(computeAverageProfessorQuality(schedule), 1, 5) / 3 +
    (1 - normalizeValue(computeMaxDistance(schedule), 0, 30)) / 3 +
    (1 - normalizeValue(computeAverageIdleTime(schedule), 0, 780)) / 3
  );
}

export function computeOverallObjectiveExtended(
  schedule: Schedule,
  soft: SConstraints,
): number {
  const TIME_MIN = 8;
  const TIME_MAX = 21;

  let sConstraintScore = 0;
  let sConstraintCount = 0;

  if (soft.gapDay != null) {
    sConstraintScore += computeGapDay(schedule, soft.gapDay) ? 1 : 0;
    sConstraintCount++;
  }
  if (soft.prefStartTime != null) {
    sConstraintScore += normalizeValue(
      computeStartTime(schedule),
      TIME_MIN,
      TIME_MAX,
    );
    sConstraintCount++;
  }
  if (soft.prefEndTime != null) {
    sConstraintScore +=
      1 - normalizeValue(computeEndTime(schedule), TIME_MIN, TIME_MAX);
    sConstraintCount++;
  }

  const s = sConstraintCount === 0 ? 0 : sConstraintScore / sConstraintCount;

  return (
    normalizeValue(computeAverageProfessorQuality(schedule), 1, 5) / 4 +
    (1 - normalizeValue(computeMaxDistance(schedule), 0, 30)) / 4 +
    (1 - normalizeValue(computeAverageIdleTime(schedule), 0, 780)) / 4 +
    s / 4
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function sectionsToInts(sections: AlgorithmSection[]): number[] {
  return sections.map((s) => s.crn);
}
