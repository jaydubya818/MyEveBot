import { WorkDashboard } from "@/components/engineering/work-dashboard";
import { notFound } from "next/navigation";

// Deployment mode must be checked at request time, including after a rollback.
export const dynamic = "force-dynamic";

export default function WorkPage() {
  if (process.env.MYEVE_ENGINEERING_MODE !== "dogfood") notFound();
  return <WorkDashboard />;
}
