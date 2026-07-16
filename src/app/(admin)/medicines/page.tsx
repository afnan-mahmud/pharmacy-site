import { listMedicines } from "@/actions/medicines";
import { MedicineTable, type MedicineRow } from "@/components/MedicineTable";

export default async function MedicinesPage() {
  const medicines = await listMedicines();

  const rows: MedicineRow[] = medicines.map((m) => ({
    id: String(m._id),
    name: m.name,
    genericName: m.genericName,
    company: m.company,
    patasPerBox: m.patasPerBox,
    boxPricePaisa: m.boxPricePaisa,
    pataPricePaisa: m.pataPricePaisa,
    lowStockThreshold: m.lowStockThreshold,
    stockPatas: m.stockPatas,
  }));

  return <MedicineTable medicines={rows} />;
}
