import { listRetailDues, retailLedger } from "@/actions/due";
import { RetailDueTable } from "@/components/RetailDueTable";

export default async function RetailDuePage() {
  const dues = await listRetailDues();

  async function fetchLedger(phone: string) {
    "use server";
    return retailLedger(phone);
  }

  return <RetailDueTable dues={dues} fetchLedger={fetchLedger} />;
}
