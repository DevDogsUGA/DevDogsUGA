import type { AlgorithmClass, AlgorithmSection, DayOfWeek } from "./types";

const ALL_DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

/**
 * Organises a set of sections into a per-day sorted class list,
 * mirroring the Java Schedule class.
 */
export class Schedule {
  readonly sections: AlgorithmSection[];
  /** Classes per day, sorted ascending by startTime. */
  readonly days: Map<DayOfWeek, AlgorithmClass[]>;

  constructor(sections: AlgorithmSection[]) {
    this.sections = [...sections];
    this.days = new Map(ALL_DAYS.map((d) => [d, []]));

    for (const section of sections) {
      for (const cls of section.classes) {
        for (const day of cls.days) {
          this.days.get(day)!.push(cls);
        }
      }
    }

    for (const classes of this.days.values()) {
      classes.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
  }
}
