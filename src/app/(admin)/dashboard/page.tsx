import { dashboardSummary } from "@/actions/dashboard";
import { DashboardCards } from "@/components/DashboardCards";

export default async function DashboardPage() {
  const summary = await dashboardSummary();
  return <DashboardCards summary={summary} />;
}
