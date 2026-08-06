import { listMedicinesPage } from "@/actions/medicines";
import { toMedicineForm } from "@/lib/unitLabels";
import { MedicineTable, type MedicineRow } from "@/components/MedicineTable";

export default async function MedicinesPage() {
  // Only the first page is rendered on the server; the table fetches the rest
  // itself as the owner searches, filters and pages.
  const first = await listMedicinesPage({});

  const rows: MedicineRow[] = first.rows.map((m) => ({
    id: m._id,
    name: m.name,
    genericName: m.genericName,
    company: m.company,
    form: toMedicineForm(m.form),
    patasPerBox: m.patasPerBox,
    purchasePricePaisa: m.purchasePricePaisa ?? 0,
    wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
    wholesalePataPricePaisa: m.wholesalePataPricePaisa,
    retailBoxPricePaisa: m.retailBoxPricePaisa,
    retailPataPricePaisa: m.retailPataPricePaisa,
    mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
    lowStockThreshold: m.lowStockThreshold,
    stockPatas: m.stockPatas,
    active: m.active,
    expiryDate: m.expiryDate ? String(m.expiryDate) : null,
  }));

  return (
    <MedicineTable
      initialRows={rows}
      initialTotal={first.total}
      initialCounts={first.counts}
      pageSize={first.pageSize}
    />
  );
}
