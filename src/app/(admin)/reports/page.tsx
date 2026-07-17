import { salesReport } from "@/actions/reports";
import { dhakaToday } from "@/lib/dhakaDate";
import { ReportView } from "@/components/ReportView";

export default async function ReportsPage() {
  // Opens on today, which is the range the owner wants most often.
  const today = dhakaToday();
  const initialReport = await salesReport(today, today);

  return <ReportView initialReport={initialReport} today={today} />;
}
