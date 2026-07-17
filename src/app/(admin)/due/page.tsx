import { listBuyerDues, buyerLedger } from "@/actions/due";
import { DueTable } from "@/components/DueTable";

export default async function DuePage() {
  const dues = await listBuyerDues();

  // The Server Action to fetch a ledger dynamically when the row is clicked.
  // Passed as a prop so the Client Component doesn't import server code directly.
  async function fetchLedger(buyerId: string) {
    "use server";
    return buyerLedger(buyerId);
  }

  return <DueTable dues={dues} fetchLedger={fetchLedger} />;
}
