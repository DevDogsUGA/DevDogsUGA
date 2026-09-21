import { AddCourses } from "~/components/courses/AddCourses";

// AddCourses reads the URL search params (active tab + selection). Rendering the
// route dynamically lets those be read on the server without a Suspense
// boundary, so the panel container is in the server HTML (no fallback flash).
export const dynamic = "force-dynamic";

export default function CoursesPage() {
  return <AddCourses />;
}
