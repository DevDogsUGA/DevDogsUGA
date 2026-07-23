import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { Course } from "~/types/course";

function meetingDays(m: {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}): string {
  return (
    [
      m.monday && "M",
      m.tuesday && "T",
      m.wednesday && "W",
      m.thursday && "R",
      m.friday && "F",
    ]
      .filter(Boolean)
      .join("") || "TBA"
  );
}

type SupabaseRow = {
  id: number;
  courseNumber: string;
  title: string;
  abbrTitle: string;
  subjects: { abbr: string } | null;
  offerings: Array<{
    crn: number;
    instructors: { firstName: string; lastName: string } | null;
    meetings: Array<{
      monday: boolean;
      tuesday: boolean;
      wednesday: boolean;
      thursday: boolean;
      friday: boolean;
      startTime: string | null;
      endTime: string | null;
    }>;
  }>;
};

export function useCoursesBySubject(subject: string | undefined) {
  return useQuery<Course[]>({
    queryKey: ["courses", "bySubject", subject],
    enabled: subject !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(
          `id, courseNumber, title, abbrTitle,
           subjects!inner(abbr),
           offerings(
             crn,
             instructors(firstName, lastName),
             meetings(monday, tuesday, wednesday, thursday, friday, startTime, endTime)
           )`,
        )
        .eq("subjects.abbr", subject!);
      if (error) throw error;

      return ((data ?? []) as unknown as SupabaseRow[]).map((r) => ({
        courseId: r.id,
        subject: r.subjects?.abbr,
        courseNumber: r.courseNumber,
        title: r.title,
        athenaTitle: r.abbrTitle,
        courseSections: r.offerings?.map((o) => ({
          crn: o.crn,
          professor: o.instructors
            ? {
                firstName: o.instructors.firstName,
                lastName: o.instructors.lastName,
              }
            : undefined,
          classes: o.meetings?.map((m) => ({
            days: meetingDays(m),
            startTime: m.startTime ?? undefined,
            endTime: m.endTime ?? undefined,
          })),
        })),
      }));
    },
  });
}
