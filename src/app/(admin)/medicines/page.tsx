import { listMedicines } from "@/actions/medicines";
import { toMedicineForm } from "@/lib/unitLabels";
import { MedicineTable, type MedicineRow } from "@/components/MedicineTable";

export default async function MedicinesPage() {
  const medicines = await listMedicines();

  const rows: MedicineRow[] = medicines.map((m) => ({
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
  }));

  return <MedicineTable medicines={rows} />;
}
