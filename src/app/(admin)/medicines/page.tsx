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
    boxPricePaisa: m.boxPricePaisa,
    pataPricePaisa: m.pataPricePaisa,
    mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
    lowStockThreshold: m.lowStockThreshold,
    stockPatas: m.stockPatas,
    active: m.active,
  }));

  return <MedicineTable medicines={rows} />;
}
