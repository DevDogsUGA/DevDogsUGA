import { redirect } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export function GET() {
  redirect(
    `https://tinyurl.com/devdogs${format(TZDate.tz("America/New_York"), "MMddyy")}`,
  );
}
