import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

/** Everything under /coach is for the coach role only. */
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== "coach") redirect("/today");
  return <>{children}</>;
}
