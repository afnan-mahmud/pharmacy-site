import "dotenv/config";
import mongoose from "mongoose";
import { MedicineModel } from "../src/models/Medicine";
import { SaleModel } from "../src/models/Sale";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  console.log("Connected to MongoDB...");

  // 1. Check all medicines
  const medicines = await MedicineModel.find({});
  console.log(`Found ${medicines.length} medicines.`);

  let updatedMedsCount = 0;
  for (const med of medicines) {
    let changed = false;
    let purchasePrice = Number(med.purchasePricePaisa) || 0;

    // If purchasePrice is 0, set it to roughly 75%-80% of wholesaleBoxPricePaisa or retailBoxPricePaisa
    if (purchasePrice <= 0) {
      const basePrice =
        Number(med.wholesaleBoxPricePaisa) > 0
          ? Number(med.wholesaleBoxPricePaisa)
          : Number(med.retailBoxPricePaisa) > 0
          ? Number(med.retailBoxPricePaisa)
          : 5000; // default 50 taka

      // Set purchase price to 78% of base price
      purchasePrice = Math.round(basePrice * 0.78);
      med.purchasePricePaisa = purchasePrice;
      changed = true;
    }

    if (changed) {
      await med.save();
      updatedMedsCount++;
      console.log(`Updated ${med.name}: purchasePricePaisa = ${purchasePrice}`);
    }
  }

  console.log(`Updated ${updatedMedsCount} medicines with valid purchase prices.`);

  // 2. Refresh medicines map
  const allMeds = await MedicineModel.find({});
  const medMap = new Map(allMeds.map((m) => [m._id.toString(), m]));

  // 3. Update existing sales without costPaisa
  const sales = await SaleModel.find({});
  console.log(`Found ${sales.length} sales.`);

  let updatedSalesCount = 0;
  for (const sale of sales) {
    let changed = false;
    for (const item of sale.items) {
      if (!item.costPaisa || item.costPaisa === 0) {
        if (item.medicineId) {
          const med = medMap.get(item.medicineId.toString());
          if (med && med.purchasePricePaisa > 0) {
            const patasPerBox = med.patasPerBox > 0 ? med.patasPerBox : 10;
            const boxes = Number(item.quantity) || 0;
            const leftoverPatas = Number(item.leftoverPatas) || 0;
            item.costPaisa =
              boxes * med.purchasePricePaisa +
              Math.round((leftoverPatas * med.purchasePricePaisa) / patasPerBox);
            changed = true;
          } else {
            // Fallback from lineTotal
            const lineTotal = Number(item.lineTotalPaisa) || 0;
            item.costPaisa = Math.round(lineTotal * 0.78);
            changed = true;
          }
        } else {
          // Custom item
          const lineTotal = Number(item.lineTotalPaisa) || 0;
          item.costPaisa = Math.round(lineTotal * 0.78);
          changed = true;
        }
      }
    }

    if (changed) {
      await sale.save();
      updatedSalesCount++;
    }
  }

  console.log(`Updated ${updatedSalesCount} sales with snapshotted costPaisa.`);

  await mongoose.disconnect();
  console.log("Done!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
