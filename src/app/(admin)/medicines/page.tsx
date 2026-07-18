import { listMedicines } from "@/actions/medicines";
import { MedicineTable, type MedicineRow } from "@/components/MedicineTable";

export default async function MedicinesPage() {
  const medicines = await listMedicines();

  const rows: MedicineRow[] = medicines.map((m) => ({
    id: m._id,
    name: m.name,
    genericName: m.genericName,
    company: m.company,
    patasPerBox: m.patasPerBox,
    boxPricePaisa: m.boxPricePaisa,
    pataPricePaisa: m.pataPricePaisa,
    mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
    lowStockThreshold: m.lowStockThreshold,
    stockPatas: m.stockPatas,
  }));

  return <MedicineTable medicines={rows} />;
}
