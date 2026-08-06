import { salesReport } from "@/actions/reports";
import { dhakaToday } from "@/lib/dhakaDate";
import { ReportView } from "@/components/ReportView";

export default async function ReportsPage() {
  // Opens on today, which is the range the owner wants most often. Only the
  // first page of rows is rendered here; the view fetches the rest as the
  // owner filters, sorts and pages.
  const today = dhakaToday();
  const initialReport = await salesReport({ fromDate: today, toDate: today });

  return <ReportView initialReport={initialReport} today={today} />;
}
